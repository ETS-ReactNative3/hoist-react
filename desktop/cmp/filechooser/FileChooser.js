/*
 * This file belongs to Hoist, an application development toolkit
 * developed by Extremely Heavy Industries (www.xh.io | info@xh.io)
 *
 * Copyright © 2021 Extremely Heavy Industries Inc.
 */
import {grid} from '@xh/hoist/cmp/grid';
import {div, hbox, input} from '@xh/hoist/cmp/layout';
import {hoistCmp, uses} from '@xh/hoist/core';
import {dropzone} from '@xh/hoist/kit/react-dropzone';
import classNames from 'classnames';
import PT from 'prop-types';
import './FileChooser.scss';
import {FileChooserModel} from './FileChooserModel';


/**
 * A component to select one or more files from the local filesystem. Wraps the third-party
 * react-dropzone component to provide both drag-and-drop and click-to-browse file selection.
 * Expands upon this core functionality with an optional grid (enabled by default) displaying
 * the list of selected files and allowing the user to remove files from the selection.
 *
 * This component should be provided with a FileChooserModel instance, as the model holds an
 * observable collection of File objects and provides a public API to manipulate the selection.
 *
 * The application is responsible for processing the selected files (e.g. by uploading them to a
 * server) and clearing the selection when complete.
 *
 * @see FileChooserModel
 */
export const [FileChooser, fileChooser] = hoistCmp.withFactory({
    displayName: 'FileChooser',
    model: uses(FileChooserModel),
    className: 'xh-file-chooser',

    render({
        model,
        accept,
        maxSize,
        minSize,
        targetText = 'Drag and drop files here, or click to browse...',
        enableMulti = true,
        enableAddMulti = enableMulti,
        showFileGrid = true,
        ...props
    }, ref) {
        const {lastRejectedCount} = model,
            fileNoun = (count) => `${count} ${count === 1 ? 'file' : 'files'}`;

        return hbox({
            ref,
            ...props,
            items: [
                dropzone({
                    accept,
                    maxSize,
                    minSize,
                    multiple: enableAddMulti,
                    item: ({getRootProps, getInputProps, isDragActive, draggedFiles}) => {
                        const draggedCount = draggedFiles.length,
                            targetTxt = isDragActive ? `Drop to add ${fileNoun(draggedCount)}.` : targetText,
                            rejectTxt = lastRejectedCount && !isDragActive ?
                                `Unable to accept ${fileNoun(lastRejectedCount)} for upload.` : '';

                        return div({
                            ...getRootProps(),
                            items: [
                                targetTxt,
                                div({
                                    className: 'xh-file-chooser__reject-warning',
                                    item: rejectTxt
                                }),
                                input({...getInputProps()})
                            ],
                            className: classNames(
                                'xh-file-chooser__target',
                                isDragActive ? 'xh-file-chooser__target--active' : null,
                                showFileGrid ? 'xh-file-chooser__target--withGrid' : null
                            )
                        });
                    },
                    onDrop: (accepted, rejected) => model.onDrop(accepted, rejected, enableMulti)
                }),
                grid({
                    flex: 1,
                    className: 'xh-file-chooser__grid',
                    omit: !showFileGrid
                })
            ]
        });
    }
});


FileChooser.propTypes = {

    /** File type(s) to accept (e.g. `['.doc', '.docx', '.pdf']`). */
    accept: PT.oneOfType([PT.string, PT.arrayOf(PT.string)]),

    /** True (default) to allow multiple files in a single upload. */
    enableMulti: PT.bool,

    /**
     * True to allow user to drop multiple files into the dropzone at once.  True also allows for selection of
     * multiple files within the OS pop-up window.  Defaults to enableMulti. */
    enableAddMulti: PT.bool,

    /** Maximum accepted file size in bytes. */
    maxSize: PT.number,

    /** Minimum accepted file size in bytes. */
    minSize: PT.number,

    /** Primary component model instance. */
    model: PT.oneOfType([PT.instanceOf(FileChooserModel), PT.object]),

    /**
     * True (default) to display the selected file(s) in a grid alongside the dropzone. Note
     * that, if false, the component will not provide any built-in indication of its selection.
     */
    showFileGrid: PT.bool,

    /** Intro/help text to display within the dropzone target. */
    targetText: PT.node
};
