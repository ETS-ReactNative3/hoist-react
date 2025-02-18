/*
 * This file belongs to Hoist, an application development toolkit
 * developed by Extremely Heavy Industries (www.xh.io | info@xh.io)
 *
 * Copyright © 2021 Extremely Heavy Industries Inc.
 */
import {HoistModel, managed, PersistenceProvider, TaskObserver, XH} from '@xh/hoist/core';
import {combineValueFilters, FieldFilter, parseFilter, withFilterByTypes} from '@xh/hoist/data';
import {action, makeObservable, observable} from '@xh/hoist/mobx';
import {wait} from '@xh/hoist/promise';
import {throwIf, withDefault} from '@xh/hoist/utils/js';
import {createObservableRef} from '@xh/hoist/utils/react';
import {
    cloneDeep,
    compact,
    flatMap,
    flatten,
    forEach,
    groupBy,
    isArray,
    isEmpty,
    isFinite,
    isFunction,
    isString,
    partition,
    sortBy,
    uniq,
    uniqBy
} from 'lodash';

import {FilterChooserFieldSpec} from './FilterChooserFieldSpec';
import {compoundFilterOption, fieldFilterOption} from './impl/Option';
import {QueryEngine} from './impl/QueryEngine';

export class FilterChooserModel extends HoistModel {

    /** @member {Filter} */
    @observable.ref value = null;

    /** @member {Filter[]} */
    @observable.ref favorites = [];

    /** @member {(Store|View)} */
    bind;

    /** @member {(Store|View)} */
    valueSource;

    /** @member {FilterChooserFieldSpec[]} */
    @managed fieldSpecs = [];

    /** @member {boolean} */
    suggestFieldsWhenEmpty;

    /** @member {boolean} */
    sortFieldSuggestions;

    /** @member {number} */
    maxTags;

    /** @member {number} */
    maxResults;

    /** @member {(string|ReactNode)} */
    introHelpText;

    /** @member {PersistenceProvider} */
    @managed provider;
    persistValue = false;
    persistFavorites = false;

    /** @member {TaskObserver} - tracks execution of filtering operation on bound object.*/
    @managed filterTask = TaskObserver.trackAll();

    // Implementation fields for Control
    @observable.ref selectOptions;
    @observable.ref selectValue;
    @observable favoritesIsOpen = false;
    @observable unsupportedFilter = false;
    inputRef = createObservableRef();

    @managed queryEngine;

    /**
     * @param c - FilterChooserModel configuration.
     * @param {(string[]|Object[]} [c.fieldSpecs] - specifies the fields this model
     *      supports for filtering and customizes how their available values will be parsed and
     *      displayed. Should be configs for a `FilterChooserFieldSpec`. If a `valueSource`
     *      is provided, these may be specified as field names in that source or omitted entirely,
     *      indicating that all fields should be filter-enabled.
     * @param {Object} [c.fieldSpecDefaults] - default properties to be assigned to all
     *      FilterChooserFieldSpecs created by this model.
     * @param {(Store|View)} [c.bind] - Store or cube View that should actually be filtered
     *      as this model's value changes. May be the same as `valueSource`. Leave undefined if you
     *      wish to combine this model's values with other filters, send it to the server,
     *      or otherwise observe and handle value changes manually.
     * @param {(Store|View)} [c.valueSource] - Store or cube View to be used to lookup matching
     *      Field-level defaults for `fieldSpecs` and to provide suggested data values (if so
     *      configured) from user input. Defaults to `bind` if provided.
     * @param {(Filter|* |[]|function)} [c.initialValue] - Configuration for a filter appropriate
     *      to be rendered and managed by FilterChooser, or a function to produce the same.
     *      Note that FilterChooser currently can only edit and create a flat collection of
     *      FieldFilters, to be 'AND'ed together.
     * @param {(Filter[]|function)} [c.initialFavorites] - initial favorites as an array of filter
     *      configurations, or a function to produce such an array.
     * @param {boolean} [c.suggestFieldsWhenEmpty] - true to offer all field suggestions when the
     *      control is focussed with an empty query, to aid discoverability.
     * @param {boolean} [c.sortFieldSuggestions] - true (default) to sort field suggestions by
     *      displayed label. Set to false to preserve the order provided to `fieldSpecs`.
     * @param {number} [c.maxTags] - maximum number of filter tags to render before disabling the
     *      control. Limits the performance impact of rendering large filters.
     * @param {number} [c.maxResults] - maximum number of dropdown options to show before
     *      truncating.
     * @param {(string|ReactNode)} introHelpText - blurb displayed above field suggestions when the
     *      control is focused but user has yet to enter a query, or null to suppress default.
     * @param {FilterChooserPersistOptions} [c.persistWith] - options governing persistence.
     */
    constructor({
        fieldSpecs,
        fieldSpecDefaults,
        bind = null,
        valueSource = bind,
        initialValue = null,
        initialFavorites = [],
        suggestFieldsWhenEmpty = true,
        sortFieldSuggestions = true,
        maxTags = 100,
        maxResults = 50,
        persistWith,
        introHelpText,
        ...rest
    } = {}) {
        super();
        makeObservable(this);

        this.bind = bind;
        this.valueSource = valueSource;
        this.fieldSpecs = this.parseFieldSpecs(fieldSpecs, fieldSpecDefaults);
        this.suggestFieldsWhenEmpty = !!suggestFieldsWhenEmpty;
        this.sortFieldSuggestions = sortFieldSuggestions;
        this.maxTags = maxTags;
        this.maxResults = maxResults;
        this.introHelpText = withDefault(introHelpText, this.getDefaultIntroHelpText());
        this.queryEngine = new QueryEngine(this);

        let value = isFunction(initialValue) ? initialValue() : initialValue,
            favorites = isFunction(initialFavorites) ? initialFavorites() : initialFavorites;

        // Read state from provider -- fail gently
        if (persistWith) {
            try {
                this.provider = PersistenceProvider.create({path: 'filterChooser', ...persistWith});
                this.persistValue = persistWith.persistValue ?? true;
                this.persistFavorites = persistWith.persistFavorites ?? true;

                const state = this.provider.read();
                if (this.persistValue && state?.value) {
                    value = state.value;
                }
                if (this.persistFavorites && state?.favorites) {
                    favorites = state.favorites.map(f => parseFilter(f));
                }

                this.addReaction({
                    track: () => this.persistState,
                    run: (state) => this.provider.write(state)
                });
            } catch (e) {
                console.error(e);
                XH.safeDestroy(this.provider);
                this.provider = null;
            }
        }

        this.setValue(value);
        this.setFavorites(favorites);

        if (bind) {
            this.addReaction({
                track: () => bind.filter,
                run: (filter) => {
                    const value = withFilterByTypes(filter, null, 'FunctionFilter');
                    this.setValue(value);
                }
            });
        }
    }

    /**
     * Set the value displayed by this control.
     *
     * @param {(Filter|* |[])} value -  Configuration for a filter appropriate to be
     *      shown in this field.
     *
     * Supports one or more FieldFilters to be 'AND'ed together, or
     * an 'AND' CompoundFilter containing such a collection of FieldFilters.
     *
     * 'OR' CompoundFilters or nested CompoundFilters are partially supported -
     * they will be displayed as tags and can be removed, but not created using
     * the control.
     *
     * Any other Filter is not supported and will cause the control to be cleared.
     */
    @action
    setValue(value) {
        const {bind, maxTags} = this;
        try {
            value = parseFilter(value);
            if (this.value?.equals(value)) return;

            // 1) Ensure filter is able to be handled by the FilterChooser
            const isValid = this.validateFilter(value),
                displayFilters = isValid ? this.toDisplayFilters(value) : null;

            this.unsupportedFilter = !isValid || (maxTags && displayFilters.length > maxTags);
            if (this.unsupportedFilter) {
                this.value = null;
                this.selectOptions = null;
                this.selectValue = null;
                return;
            }

            // 2) Main path - set internal value.
            console.debug('Setting FilterChooser value:', value);
            this.value = value;

            // 3) Set props on select input needed to display
            // Build list of options, used for displaying tags. We combine the needed
            // options for the current filter tags with any previous ones to ensure
            // tags are rendered correctly throughout the transition.
            const newOptions = displayFilters.map(f => this.createFilterOption(f)),
                previousOptions = this.selectOptions ?? [],
                options = uniqBy([...newOptions, ...previousOptions], 'value');

            this.selectOptions = !isEmpty(options) ? options : null;

            // Set select value async after options, to ensure it is able to render tags correctly
            const selectValue = sortBy(displayFilters.map(f => JSON.stringify(f)), f => {
                const idx = this.selectValue?.indexOf(f);
                return isFinite(idx) && idx > -1 ? idx : displayFilters.length;
            });
            wait().thenAction(() => this.selectValue = selectValue);

            // 4) Round-trip value to bound filter
            if (bind) {
                wait().then(() => {
                    const filter = withFilterByTypes(bind.filter, value, ['FieldFilter', 'CompoundFilter']);
                    bind.setFilter(filter);
                }).linkTo(this.filterTask);
            }
        } catch (e) {
            console.error('Failed to set value on FilterChooserModel', e);
            this.value = null;
            this.selectOptions = null;
            this.selectValue = null;
            this.unsupportedFilter = true;
        }
    }

    //---------------------------
    // Value Handling/Processing
    //---------------------------
    setSelectValue(selectValue) {
        // Rehydrate stringified values
        selectValue = compact(flatten(selectValue)).map(JSON.parse);

        // Separate actual selected filters from field suggestion.
        // (the former is just a transient value on the select control only)
        const [filters, suggestions] = partition(selectValue, 'op');

        // Round-trip actual filters through main value setter above.
        this.setValue(combineValueFilters(filters));

        // And then programmatically re-enter any suggestion
        if (suggestions.length === 1) this.autoComplete(suggestions[0]);
    }

    // Transfer the value filter to the canonical set of individual filters for display.
    // Filters with arrays values will be split.
    toDisplayFilters(filter) {
        if (!filter) return [];

        let ret;
        const unsupported = (s) => {
            throw XH.exception(`Unsupported Filter in FilterChooserModel: ${s}`);
        };

        // 1) Flatten CompoundFilters across disparate fields to FieldFilters.
        if (filter.isCompoundFilter && !filter.field) {
            ret = filter.filters;
        } else  {
            ret = [filter];
        }
        if (ret.some(f => !f.isFieldFilter && !f.isCompoundFilter)) {
            unsupported('Filters must be FieldFilters or CompoundFilters.');
        }

        // 2) Recognize unsupported multiple filters for array-based filters.
        const groupMap = groupBy(ret, ({op, field}) => `${op}|${field}`);
        forEach(groupMap, filters => {
            const {op} = filters[0];
            if (filters.length > 1 && FieldFilter.ARRAY_OPERATORS.includes(op)) {
                unsupported(`Multiple filters cannot be provided with ${op} operator`);
            }
        });

        // 3) Finally unroll multi-value filters to one value per filter.
        // The multiple values will later be restored.
        return flatMap(ret, (f) => {
            return isArray(f.value) ?
                f.value.map(value => new FieldFilter({...f, value})) :
                f;
        });
    }

    //-------------
    // Querying
    //---------------
    async queryAsync(query) {
        return this.queryEngine.queryAsync(query);
    }

    //--------------------
    // Autocomplete
    //--------------------
    autoComplete(value) {
        const rsSelectCmp = this.inputRef.current?.reactSelectRef?.current;
        if (!rsSelectCmp) return;

        const currentVal = rsSelectCmp.select.state.inputValue,
            newVal = value.displayName,
            inputValue = newVal.length > currentVal.length ? newVal : currentVal;

        rsSelectCmp.select.setState({inputValue, menuIsOpen: true});
        wait().then(() => {
            rsSelectCmp.focus();
            rsSelectCmp.handleInputChange(inputValue);
        }).thenAction(() => {
            // Setting the Select's `inputValue` state above has the side-effect of modifying
            // it's internal `value`. Force synchronise its `value` to our bound `selectValue`
            // to get it back inline. Note we're intentionally not using `setSelectValue()`,
            // which returns early if the actual filter value hasn't changed.
            this.selectValue = cloneDeep(this.selectValue);
        });
    }

    //---------------------------------
    // Options
    //---------------------------------
    createFilterOption(filter) {
        if (filter.isFieldFilter) {
            return fieldFilterOption({filter, fieldSpec: this.getFieldSpec(filter.field)});
        } else if (filter.isCompoundFilter) {
            const fieldNames = uniq(filter.filters.map(it => this.getFieldSpec(it.field)?.displayName));
            return compoundFilterOption({filter, fieldNames});
        }
    }

    //--------------------
    // Favorites
    //--------------------
    get favoritesOptions() {
        return this.favorites.map(value => ({
            value,
            filterOptions: this.toDisplayFilters(value).map(f => this.createFilterOption(f))
        }));
    }

    @action
    openFavoritesMenu() {
        this.favoritesIsOpen = true;
    }

    @action
    closeFavoritesMenu() {
        this.favoritesIsOpen = false;
    }

    @action
    setFavorites(favorites) {
        this.favorites = favorites.filter(f => this.validateFilter(f));
    }

    @action
    addFavorite(filter) {
        if (isEmpty(filter) || this.isFavorite(filter)) return;
        this.favorites = [...this.favorites, filter];
    }

    @action
    removeFavorite(filter) {
        this.favorites = this.favorites.filter(f => !f.equals(filter));
    }

    isFavorite(filter) {
        return this.favorites?.find(f => f.equals(filter));
    }

    //-------------------------
    // Persistence handling
    //-------------------------
    get persistState() {
        const ret = {};
        if (this.persistValue) ret.value = this.value;
        if (this.persistFavorites) ret.favorites = this.favorites;
        return ret;
    }

    //--------------------------------
    // FilterChooserFieldSpec handling
    //--------------------------------
    parseFieldSpecs(specs, fieldSpecDefaults) {
        const {valueSource} = this;

        throwIf(
            !valueSource && (!specs || specs.some(isString)),
            'Must provide a valueSource if fieldSpecs are not provided, or provided as strings.'
        );

        // If no specs provided, include all source fields.
        if (!specs) specs = valueSource.fieldNames;

        return specs.map(spec => {
            if (isString(spec)) spec = {field: spec};
            return new FilterChooserFieldSpec({
                source: valueSource,
                ...fieldSpecDefaults,
                ...spec
            });
        });
    }

    getFieldSpec(fieldName) {
        return this.fieldSpecs.find(it => it.field === fieldName);
    }

    validateFilter(f) {
        if (f === null) return true;
        if (f.isFieldFilter) {
            if (!this.getFieldSpec(f.field)) {
                console.error(`Invalid Filter for FilterChooser: ${f.field}`);
                return false;
            }
            return true;
        }

        if (f.isCompoundFilter) {
            return f.filters.every(it => this.validateFilter(it));
        }

        console.error('Invalid filter for FilterChooser', f);
        return false;
    }

    getDefaultIntroHelpText() {
        return 'Select or enter a field name (below) or begin typing to match available field values.';
    }
}

/**
 * @typedef {Object} FilterChooserPersistOptions
 * @extends PersistOptions
 * @property {boolean} [persistValue] - true (default) to save value to state.
 * @property {boolean} [persistFavorites] - true (default) to include favorites.
 */
