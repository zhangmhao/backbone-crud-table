/**
 * CRUD Table
 *
 * 提供CRUD功能的Table，基于Backbone, 提供local和remote的增删改查功能。
 *
 * 主要配置项
 *
 *     name: {String} 表格名称
 *     editable: {Boolean} 是否可编辑，默认为false，不可编辑
 *     columns: {Array} 栏目配置
 *     data: {Array} 提供表格数据
 *     api: {object} 表格remote接口配置
 *
 * 例子
 * var crudTable = new CRUDTable({
 *     name: '联系人表',
 *     storage: 'local',
 *     editable: true,
 *     columns: [{
 *         name: 'address',
 *         displayName: '地址'
 *     }, {
 *         name: 'tel',
 *         displayName: '电话'
 *     }, {
 *         name: 'name',
 *         displayName: '姓名'
 *     }],
 *     data: [{
 *        name: 'andrew',
 *        tel: '888',
 *        address: '天堂路1号'
 *     }, {
 *        name: 'andrew',
 *        tel: '888',
 *        address: '天堂路1号'
 *     }, {
 *        name: 'andrew',
 *        tel: '888',
 *        address: '天堂路1号'
 *     }]
 * })
 * @create 2014-05-08
 */

(function (window, undefined) {
    'use strict';

        /**
         * 创建全局按钮
         */
    var _createButtons = function (buttons) {
        if (!buttons) {
            return null;
        }
        var defaultCfg = {
                iconClass: '',
                buttonClass: '',
                text: ''
            },
            fragment = document.createDocumentFragment(),
            Btn = _.template('<a class="crud-btn crud-<%=action%> <%=buttonClass%>"><i class="crud-btn-icon <%=iconClass%>"></i><%=text%></a>');
        _.each(buttons, function (btn) {
            btn = _.extend({}, defaultCfg, btn);
            fragment.appendChild($(Btn(btn))[0]);
        });
        return fragment;
    },


    /**
     * 状态切换生成器
     */
    statusSwitcherGenerator = function (statusType) {
        return function (status) {
            this.$el[status? 'addClass' : 'removeClass'](statusType);
            this.setStatus(statusType, status);
        };
    },
    emptyFunc = function () {},
    calculateTotalWidth = function (columns) {
        var totalWidth = 0;
        _.each(columns, function (col) {
            totalWidth += col.width || 0;
        });
        return totalWidth;
    };

    var STATUS_PREFIX = 'crud-',
        STATUS_DELETING = STATUS_PREFIX + 'deleting',
        STATUS_EDITING = STATUS_PREFIX + 'editing',
        STATUS_SAVING = STATUS_PREFIX + 'saving';
    window.CrudTable = Backbone.View.extend({

        tagName: 'table',
        /**
         * 初始化
         */
        initialize: function (options) {
            Backbone.emulateHTTP = options.emulateHTTP;
            this.data = options.data;
            this.name = options.name;
            this.columns = options.columns;
            this.className = options.className;
            this.editable = options.editable;
            this.autoLoad = options.autoLoad === undefined ? true : options.autoLoad;
            this.listeners = options.listeners || {};
            //记录新添加记录的个数
            this._appendLength = 0;
            //status
            this.status = {};
            this.options = options;
            if (options.buttonCfg) {
                this.headerButtons = options.buttonCfg.buttons;
            }
            var buttonColumn = this._getRowButtons(this.columns);
            if (buttonColumn) {
                this.rowButtons = buttonColumn.buttons;
                this.rowButtonControl = buttonColumn.display || emptyFunc;
            }
            var tableWidth = calculateTotalWidth(this.columns);
            if (tableWidth) {
                this.tableWidth = tableWidth;
            }
            this._defineView();
            this._createModelFromColumns(options.columns);
            this.listenTo(this.rowList, 'add', this.add);
            this.listenTo(this.rowList, 'remove', this.checkTableCount);
            this.listenTo(this.rowList, 'reset', this.resetTableBody);
        },

        /**
         * 渲染
         */
        render: function () {

            this.$el.addClass('crud-table');
            this.$el.addClass(this.className);
            this._renderTableHeader();
            this.$tbody = this._renderTableBody();
            this.checkTableCount();
            this._renderTableFooter();

            this.$loading = $('<div class="crud-mask">loading</div>');
            this.$el.append(this.$loading.hide());
            return this;
        },

        events: {
            //清空所有数据
            'click .crud-clear-all': 'clearAll',
            'click .crud-create': 'addNew',
            'click .crud-refresh': 'refresh'
        },

        _getRowButtons: function (columns) {
            var result;
            _.each(columns, function (col) {
                if (col.name === 'crud-buttons') {
                    result = col;
                }
            });
            return result;
        },

        resetTableBody: function (collection) {
            var that = this;
            this.$tbody.empty();
            collection.each(function (model) {
                that.add(model);
            });
        },

        /**
         * 定义并创建Model
         * 创建 Row 和 RowCollection 对于的Model
         */
        _createModelFromColumns: function (columns) {
            //获取每一个表格栏目的默认取值
            var table = this,
                getValidator = function (columns) {
                    var validator = {};
                    _.each(columns, function (col) {
                        if (col.validate) {
                            validator[col.name] = col.validate;
                        }
                    });
                    return validator;
                },
                getDefaultValue = function (columns, cxt) {
                    var defaultValues = {};
                    for (var i = 0, len = columns.length; i < len; i++) {
                        var item = columns[i],
                            defaultVal = item.defaultValue;
                        if (typeof defaultVal === 'function') {
                            defaultVal = defaultVal.call(cxt, table.rowList);
                        }
                        defaultValues[item.name] = defaultVal === undefined ? '' :
                                                    defaultVal;
                    }
                    return defaultValues;
                };
            //定义表格每一行的Model
            var RowModel = Backbone.Model.extend({
                idAttribute: this.options.idAttribute,
                defaults: function () {
                    return getDefaultValue(columns, this);
                },
                validation: getValidator(columns),
                api: this.options.api,
                parse: function (result) {
                    //兼容返回结果不是标准的backbone返回结果
                    if (result.id !== undefined) {
                        return result;
                    } else {
                        return result.data;
                    }
                },
                sync: function(method, model, options) {
                    options = options || {};
                    options.wait = true;
                    options.url = model.api[method.toLowerCase()];
                    return Backbone.sync.apply(this, arguments);
                }
            });
            this.RowModel = RowModel;
            var collectionModelCfg = {
                model: RowModel,
                api: this.options.api,
                idAttribute: this.options.idAttribute,
                sync: function(method, model, options) {
                    options = options || {};
                    options.url = model.api[method.toLowerCase()];
                    return Backbone.sync.apply(this, arguments);
                }
            };

            var parse = this.options.parse;
            if (parse) {
                collectionModelCfg.parse = parse;
            }

            //本地存储模式，则使用localStorage进行存储数据
            var storage = this.options.storage;
            if (storage === 'local') {
                var storageKey = 'backbone-storage-crud-table-' + this.options.name;
                collectionModelCfg.localStorage = new Backbone.LocalStorage(storageKey);
            } else if (storage === 'remote') {
                collectionModelCfg.url = this.options.url;
            } else {
                throw new Error('数据库option.storage配置出错,取值是remote或者local');
            }
            //定义表格列表Model
            var RowCollection = Backbone.Collection.extend(collectionModelCfg);
            this.rowList = new RowCollection();
        },

        /**
         * 定义View层
         * 定义Row的View
         */
        _defineView: function () {
            var table = this;
            // See: http://thedersen.com/projects/backbone-validation/#configuration/callbacks
            //_.extend(Backbone.Validation.callbacks, {
                //valid: function (view, attr, selector) {
                    //console.log('valid');
                //},
                //invalid: function (view, attr, error, selector) {
                    //console.log('invalid');
                //}
            //});
            //表格行的View
            var rowViewCfg = {
                tagName: 'tr',
                template: _.template(this._createTemplate()),
                events: {
                    //todo
                    'click .crud-delete' : 'clear',
                    'click .crud-edit': 'edit',
                    'click .crud-save': 'save',
                    'click .crud-cancel': 'cancel'
                },

                //初始化
                initialize: function (options) {
                    this.options = options;
                    this.addingNew = options.addingNew;
                    this.rowButtonControl = table.rowButtonControl;
                    //状态变量，记录deleting editing等状态
                    this.status = {};
                    Backbone.Validation.bind(this, {
                        valid: function (view, attr) {
                            var $el = view.$('[name=' + attr + ']');
                            $el.removeClass('invalid');
                            var $container = $el.closest('td');
                            $container.find('.error-help').remove();
                        },
                        invalid: function (view, attr, error) {
                            var $el = view.$('[name=' + attr + ']');
                            $el.addClass('invalid');
                            var $container = $el.closest('td');
                            $container.append('<p class="error-help">' + error + '</p>');
                        }
                    });
                    //数据改变，重新渲染
                    this.listenTo(this.model, 'change', this.render);
                    //model删除数据，则界面Remove数据
                    this.listenTo(this.model, 'destroy', this.remove);
                },

                //渲染界面
                render: function () {
                    var renderData = this.model.toJSON(),
                        rowList = table.rowList,
                        pos = rowList.indexOf(this.model);
                    //新添加的记录不在collection中，所以pos是-1,
                    //由于新添加的记录是追加的形式，因此 __crud_order__ = collection.length
                    renderData.__crud_order__ = (pos >= 0 ? pos : rowList.length + table._appendLength - 1) + 1;
                    this.$el.html(this.template(renderData));
                    var that = this,
                        inputEditableCls = 'crud-input-editable',
                        labelEditableCls = 'crud-label-editable';
                    this.$el.find('.crud-row-buttons').append(_createButtons(table.rowButtons));
                    this.$el.find('label');
                    this.$el.find('input').hide();

                    var columns = table.columns;
                    //新纪录不需要控制栏目的可编辑与否
                    if (!this.model.isNew()) {
                        _.each(columns, function (col) {
                            var colEditable = col.editable;
                            if (typeof col.editable === 'function') {
                                colEditable = col.editable.apply(that);
                            }
                            //栏目默认是可编辑的
                            if (colEditable || colEditable === undefined) {
                                that.$el.find('input[name=' + col.name + ']').addClass(inputEditableCls);
                                that.$el.find('label[for=' + col.name + ']').addClass(labelEditableCls);
                            }
                        });
                        this.$inputs = this.$el.find('.' + inputEditableCls);
                        this.$labels = this.$el.find('.' + labelEditableCls);
                    } else {
                        this.$inputs = this.$el.find('input');
                        this.$labels = this.$el.find('label');
                    }
                    //让用户自定义其行按钮的控制
                    this.rowButtonControl && this.rowButtonControl();
                    this.displayButton(['save', 'cancel'], false);
                    return this;
                },

                //删除
                clear: function () {
                    //正在删除中则不能点击删除
                    if (this.getStatus(STATUS_DELETING)) {
                        return;
                    }
                    var that = this,
                        requestData = {
                            id: this.model.id
                        };
                    Backbone.emulateJSON = true;
                    var beforeDelete = table.listeners.beforeDelete;
                    //提供接口给用户自定义删除操作的请求参数
                    if (beforeDelete) {
                        requestData = beforeDelete.call(this, requestData);
                    }
                    //如果用户返回false,则表示不删除
                    if (requestData === false) {
                        return;
                    }
                    var url = table.options.api.delete;
                    this._deleting(true);
                    //Backbone.emulateJSON = false;
                    Backbone.ajax({
                        method: 'POST',
                        url: url,
                        data: requestData,
                        success: function (resp) {
                            that._deleting(false);
                            if (resp.success) {
                                //从collection中移除
                                table.rowList.remove(that.model);
                                //删除view
                                that.remove();
                                that.trigger('deleteSuccess', that.model);
                            } else {
                                that.trigger('deleteError', resp.msg);
                            }
                        },
                        error: function () {
                            that._deleting(false);
                            that.trigger('deleteError', that.model);
                        }
                    });
                },

                //保存
                save: function () {
                    //防止重复点击按钮
                    if (this.getStatus(STATUS_SAVING)) {
                        return;
                    }
                    var that = this,
                        newAttrs = this._getValues(),
                        beforeSave = table.listeners.beforeSave;
                    //提供接口给用户自定义保存操作的请求参数
                    if (beforeSave) {
                        newAttrs = beforeSave.call(this, newAttrs);
                    }
                    this.model.set(newAttrs, {silent: true});
                    if (!this.model.isValid(true)) {
                        return;
                    }
                    var url = table.options.api[this.model.isNew() ? 'create' : 'update'];

                    //切换为"保存中"状态
                    this._saving(true);

                    Backbone.ajax({
                        method: 'POST',
                        url: url,
                        data: _.extend({}, that.model.attributes, newAttrs),
                        success: function (resp) {
                            that._saving(false);
                            if (resp.success) {
                                that.model.set(_.extend({}, that.model.attributes, resp.data));
                                that.trigger('saveSuccess', that.model);
                                that._editing(false);
                            } else {
                                that.trigger('saveError', resp.msg);
                            }
                        },
                        error: function () {
                            that._saving(false);
                            that.trigger('saveError', that.model);
                        }
                    });
                },

                //取消
                cancel: function () {
                    this._editing(false);
                    if (this.model.isNew()) {
                        table._appendLength--;
                        this.model.destroy();
                    }
                },

                //编辑
                edit: function () {
                    //正在删除中则不能点击编辑
                    if (this.getStatus(STATUS_DELETING)) {
                        return;
                    }
                    this._editing(true);
                },

                //控制按钮显示与隐藏
                displayButton: function (btns, isShow) {
                    var that = this;
                    _.each(btns, function (btn) {
                        that.$el.find('.crud-' + btn)[isShow ? 'show' : 'hide']();
                    });
                },

                //获取value
                _getValues: function () {
                    var that = this,
                        columns = this.options.columns,
                        data = {};
                    _.each(columns, function (col) {
                        data[col.name] = that.$el.find('input[name=' + col.name +']').val();
                    });
                    return data;
                },

                //切换为编辑状态
                _editing: function (isEditing) {
                    this.setStatus(STATUS_EDITING, isEditing);
                    this.$el[isEditing ? 'addClass' : 'removeClass'](STATUS_EDITING);
                    this.displayButton(['edit', 'delete'], !isEditing);
                    this.displayButton(['save', 'cancel'], isEditing);
                    this.rowButtonControl();
                    this.$('.error-help').hide();
                    this.$labels[isEditing ? 'hide' : 'show']();
                    //显示所有的编辑框
                    this.$inputs[isEditing ? 'show' : 'hide']();
                    //聚焦在第一个编辑框
                    isEditing && this.$inputs.eq(0).focus();
                },


                /**
                 * 设置状态
                 */
                setStatus: function (type, status) {
                    this.status[type] = status;
                },


                /**
                 * 获取状态
                 */
                getStatus: function (type) {
                    return this.status[type];
                },


                /**
                 * 切换界面的删除状态
                 */
                _deleting: statusSwitcherGenerator(STATUS_DELETING),


                /**
                 * 切换保存状态
                 */
                _saving: statusSwitcherGenerator(STATUS_SAVING)

            };
            this.RowView = Backbone.View.extend(rowViewCfg);
        },


        /**
         * 创建表格的Template
         */
        _createTemplate: function () {
            var tpl = '',
                columns = this.columns,
                editable = this.editable,
                style,
                validate,
                validator = '',
                width,
                col;

            for (var i = 0, len = columns.length, content; i < len; i++) {
                col = _.extend({}, {hidden: false, editable: true}, columns[i]);
                content = '';
                if (['crud-buttons', 'crud-order'].indexOf(col.name) < 0) {
                    if (editable) {
                        validate = col.validate;
                        if (validate && validate.maxLength) {
                            validator += 'maxlength=' + validate.maxLength + ' ';
                        }
                        if (validate && validate.minLength) {
                            validator += 'minlength=' + validate.minLength + ' ';
                        }
                        content = '<label for="' + col.name + '"><%-' + col.name +
                            '%></label><input type="text" name="' +
                            col.name+ '" value="<%-' + col.name + '%>"' + validator + '/>';
                    } else {
                        content = '<%-' + col.name + '%>';
                    }
                } else if (col.name === 'crud-order') {
                    content = '<%= __crud_order__ %>';
                }
                style = col.hidden ? 'display: none;' : '';
                if (col.width !== undefined) {
                    width = 'width="' + col.width + '"';
                    style += 'max-width:' + col.width + 'px;"';
                }
                tpl += '<td class="' + (col.name === 'crud-buttons' ? 'crud-row-buttons' : '') + '" style="' + style + '"' + width +'>' + content + '</td>';
            }
            return tpl;
        },


        /**
         * 添加记录
         */
        add: function (row) {
            //添加新的记录，则清空没有数据的提示
            if (this.rowList.length === 1) {
                this.$tbody.empty();
            }
            var rowView = new this.RowView({model: row, columns: this.columns});
            this.listenTo(rowView, 'saveError', function (msg) {
                alert('失败:' + msg);
            });
            this.listenTo(rowView, 'deleteError', function (msg) {
                alert('删除失败:' + msg);
            });
            //this.listenTo(rowView, 'delete', this.clear);
            this.$tbody.append(rowView.render().$el);
        },


        /**
         * 添加新记录
         */
        addNew: function () {
            //加载过程中不能够添加新纪录
            if (this.getStatus('loading')) {
                return;
            }
            //新添加记录+1
            this._appendLength += 1;
            var that = this,
                rowView = new this.RowView({model: new this.RowModel(), columns: this.columns});
            this.$el.append(rowView.render().$el);
            rowView.edit();
            this.listenTo(rowView, 'saveSuccess', function (model) {
                that.rowList.add(model);
                rowView.remove();
            });
            this.listenTo(rowView, 'saveError', function (msg) {
                alert('失败:' + msg);
            });
        },


        /**
         * 设置状态
         */
        setStatus: function (type, status) {
            this.status[type] = status;
        },


        /**
         * 获取状态
         */
        getStatus: function (type) {
            return this.status[type];
        },


        //删除
        refresh: function () {
            this.fetch(true);
        },


        //删除全部
        clearAll: function () {
            _.invoke(this.rowList.toArray(), 'destroy');
        },


        /**
         * 加载数据
         */
        fetch: function (refresh) {
            var that = this;
            this._loading(true);
            this.rowList.fetch({
                reset: refresh,
                success: function () {
                    that.checkTableCount();
                    that._loading(false);
                },
                error: function () {
                    //todo
                    that._loading(false);
                }
            });
        },


        /**
         * 检查表格的行数
         */
        checkTableCount: function () {
            if (this.rowList.length === 0) {
                this.$tbody.append($('<tr class="crud-no-data"><td colspan="' +
                    (this.columns.length + 1) +'">没有数据</td></tr>'));
            } else {
                this.$el.find('.crud-no-data').remove();
            }
        },


        /**
         * 渲染表格头部
         */
        _renderTableHeader: function () {
            var $caption = $('<caption>' + this.name + '</caption>');
            if (this.headerButtons) {
                $caption.append(_createButtons(this.headerButtons));
            }
            this.$el.append($caption);
            var columns = this.columns,
                fragment = document.createDocumentFragment(),
                col,
                $head = $('<thead><tr></tr></thead>');
            for (var i = 0, len = columns.length; i < len; i++) {
                col = _.extend({}, {hidden: false}, columns[i]);
                if (col.hidden) {
                    continue;
                }
                col = columns[i];
                fragment.appendChild($('<th>' + col.displayName + '</th>')[0]);
            }
            $head.find('tr').append(fragment);
            this.$el.append($head);
        },


        /**
         * 渲染table footer
         */
        _renderTableFooter: function () {
            //this.$el.append($('<tfoot><tr><td colspan="' + (this.columns.length + 1) +'"></td></tr></tfoot>'));
        },


        /**
         * 渲染表格主体
         */
        _renderTableBody: function () {
            var $tbody = $('<tbody>');
            this.$el.append($tbody);
            return $tbody;
        },


        /**
         * 切换界面的loading状态
         */
        _loading: function (isLoading) {
            this.setStatus('loading', isLoading);
            var $tbody = this.$tbody;
            var height = $tbody.height(),
                width = $tbody.width();
            var $mask = this.$el.find('.crud-mask').css({
                width: width,
                height: height,
                'margin-top': -height,
                'line-height': height + 'px'
            })[isLoading ? 'show' : 'hide']();
            var loading = this.options.loading;
            loading && loading($mask);
        }

    });
})(window);
