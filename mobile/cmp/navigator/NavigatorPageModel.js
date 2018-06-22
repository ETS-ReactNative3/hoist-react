/*
 * This file belongs to Hoist, an application development toolkit
 * developed by Extremely Heavy Industries (www.xh.io | info@xh.io)
 *
 * Copyright © 2018 Extremely Heavy Industries Inc.
 */
import {HoistModel} from '@xh/hoist/core';
import {uniqueId, snakeCase} from 'lodash';

/**
 * Model for a navigator page
 */
@HoistModel()
export class NavigatorPageModel {
    key = null;
    pageFactory = null;
    props = null;
    title = null;

    /**
     * @param {function} pageFactory - element factory for page component.
     * @param {Object} [props] - props to passed to page upon creation
     * @param {string} [title] - title for page. Displayed in AppBar header.
     */
    constructor({
        pageFactory,
        props,
        title
    }) {
        this.pageFactory = pageFactory;
        this.props = props;
        this.title = title;

        const key = title ? snakeCase(title) : 'page';
        this.key = uniqueId(`${key}_`);
    }
}