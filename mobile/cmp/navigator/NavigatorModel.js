/*
 * This file belongs to Hoist, an application development toolkit
 * developed by Extremely Heavy Industries (www.xh.io | info@xh.io)
 *
 * Copyright © 2018 Extremely Heavy Industries Inc.
 */
import {HoistModel} from '@xh/hoist/core';
import {observable, action} from '@xh/hoist/mobx';
import {uniqueId, clone} from 'lodash';

/**
 * Model for handling navigation between Onsen pages
 */
@HoistModel()
export class NavigatorModel {

    @observable title;
    @observable.ref pages = [];

    _navigator = null;
    _callback = null;

    /**
     * @param {Object} page - page spec
     * @param {function} page.pageFactory - element factory for page component.
     * @param {Object} [page.props] - props to passed to page upon creation
     * @param {string} [page.title] - title for current page.
     */
    constructor(page) {
        this.initPage = page;
        this.onPageChange();
    }

    /**
     * @param {Object} page - page spec
     * @param {function} page.pageFactory - element factory for page component.
     * @param {Object} [page.props] - props to passed to page upon creation
     * @param {string} [page.title] - title for current page.
     * @param {function} [callback] - function to execute after the page transition
     */
    pushPage(page, callback) {
        this._navigator.pushPage(page);
        this._callback = callback;
    }

    /**
     * @param {function} callback - function to execute after the page transition
     */
    popPage(callback) {
        this._navigator.popPage();
        this._callback = callback;
    }

    onPageChange() {
        this.updatePages();
        this.updateTitle();
        this.doCallback();
    }

    //--------------------
    // Implementation
    //--------------------
    renderPage(page, navigator) {
        if (!this._navigator) this._navigator = navigator;

        const {pageFactory, props} = page,
            key = uniqueId('page_');

        return pageFactory({key, ...props});
    }

    @action
    updatePages() {
        this.pages = this._navigator ? clone(this._navigator.pages) : [];
    }

    @action
    updateTitle() {
        const page = this.getCurrentPageCfg();
        this.title = page.title;
    }

    getCurrentPageCfg() {
        const nav = this._navigator;
        return nav ? nav.routes[nav.routes.length - 1] : this.initPage;
    }

    doCallback() {
        if (this._callback) this._callback();
        this._callback = null;
    }

}