/*
* This file belongs to Hoist, an application development toolkit
* developed by Extremely Heavy Industries (www.xh.io | info@xh.io)
*
* Copyright © 2021 Extremely Heavy Industries Inc.
*/
import {grid, gridCountLabel} from '@xh/hoist/cmp/grid';
import {filler, span} from '@xh/hoist/cmp/layout';
import {storeFilterField} from '@xh/hoist/cmp/store';
import {creates, hoistCmp} from '@xh/hoist/core';
import {button, exportButton} from '@xh/hoist/desktop/cmp/button';
import {panel} from '@xh/hoist/desktop/cmp/panel';
import {Icon} from '@xh/hoist/icon';
import {EhCacheModel} from './EhCacheModel';

export const ehCachePanel = hoistCmp.factory({
    model: creates(EhCacheModel),

    render({model}) {
        return panel({
            mask: 'onLoad',
            tbar: [
                Icon.info(),
                span({
                    item: 'Hibernate (Ehcache) caches for server-side domain objects',
                    className: 'xh-bold'
                }),
                filler(),
                button({
                    icon: Icon.reset(),
                    text: 'Clear All',
                    intent: 'danger',
                    onClick: () => model.clearAllAsync()
                }),
                '-',
                gridCountLabel({unit: 'cache'}),
                '-',
                storeFilterField({matchMode: 'any'}),
                exportButton()
            ],
            item: grid()
        });
    }
});
