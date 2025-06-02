sap.ui.define(
  [
    'sap/ui/core/mvc/Controller',
    'sap/ui/model/Filter',
    'sap/ui/model/FilterOperator',
    'sap/m/MessageToast',
    'sap/ui/core/Fragment',
    'sap/m/MessageBox',
    'sap/ui/model/json/JSONModel',
  ],
  function (
    Controller,
    Filter,
    FilterOperator,
    MessageToast,
    Fragment,
    MessageBox,
    JSONModel
  ) {
    'use strict';

    return Controller.extend('fiori.research.controller.BookList', {
      _oAuthorDialog: null,
      _oBookDialog: null,

      _oEditContext: null,
      _sSelectedAuthorId: null,

      onInit: function () {
        const oViewModel = new JSONModel({
          authorSelected: false,
          bookSelected: false,
          dialogMode: null,
          dialogTitle: '',
        });
        this.getView().setModel(oViewModel, 'view');
      },

      onAuthorSelect: function () {
        const oList = this.byId('authorList');
        const oAuthorSelected = oList.getSelectedItem();

        // store enablement state
        this.getView()
          .getModel('view')
          .setProperty('/authorSelected', oAuthorSelected !== null);

        if (!oAuthorSelected) {
          this._bindBooks(null);
          this._sSelectedAuthorId = null; // clear it
          return;
        }

        // your existing bind-books logic…
        if (!oAuthorSelected) {
          this._bindBooks(null);
          return;
        }
        const sAuthorId = oAuthorSelected.getBindingContext().getProperty('ID');
        this._sSelectedAuthorId = sAuthorId;
        this._bindBooks(sAuthorId);
      },

      /**
       * Binds or clears the Books table depending on whether an authorID is passed.
       * @param {string|null} sAuthorId
       * @private
       */
      _bindBooks: function (sAuthorID) {
        const oTable = this.byId('booksTable');

        if (!sAuthorID) {
          oTable.unbindItems();
          return;
        }

        oTable.bindItems({
          path: '/Books',
          filters: [new Filter('author_ID', FilterOperator.EQ, sAuthorID)],
          template: new sap.m.ColumnListItem({
            cells: [
              new sap.m.Text({ text: '{title}' }),
              new sap.m.Text({ text: '{descr}' }),
              new sap.m.ObjectNumber({ number: '{stock}' }),
              new sap.m.ObjectNumber({
                number: '{price}',
                unit: '{currency_code}',
              }),
            ],
          }),
        });
      },

      // stubs for add/edit/delete
      onAddAuthor: async function () {
        this.getView().getModel('view').setProperty('/dialogMode', 'create');
        this.getView()
          .getModel('view')
          .setProperty('/dialogTitle', 'New Author');

        if (!this._oAuthorDialog) {
          this._oAuthorDialog = await Fragment.load({
            id: this.getView().getId(),
            name: 'fiori.research.view.AuthorDialog',
            controller: this,
          });
          this.getView().addDependent(this._oAuthorDialog);
        }
        this._oAuthorDialog.open();
      },

      onDialogCancel: function () {
        this._closeAndDestroyDialog();
      },

      onDialogAuthorConfirm: async function () {
        const oModel = this.getView().getModel();
        const sViewId = this.getView().getId();
        const oViewModel = this.getView().getModel('view');
        const sMode = oViewModel.getProperty('/dialogMode');
        const sName = Fragment.byId(sViewId, 'nameInput').getValue().trim();
        const sBio = Fragment.byId(sViewId, 'bioInput').getValue().trim();

        const bodyData = {
          name: sName,
          bio: sBio,
        };
        try {
          if (sMode === 'create') {
            // CREATE
            const oListBinding = oModel.bindList('/Authors');
            await oListBinding.create(bodyData).created();
            MessageToast.show('Author created');
          } else {
            // EDIT
            const oContext = this._oEditContext;
            await oContext.setProperty('name', sName);
            await oContext.setProperty('bio', sBio);
            await oModel.submitBatch(oModel.getUpdateGroupId());
            MessageToast.show('Author updated');
          }
          this._refreshAuthorList();
          this._closeAndDestroyDialog();
        } catch (oError) {
          MessageBox.error(oError.message || 'Operation failed');
        }
      },

      onEditAuthor: async function () {
        const oList = this.byId('authorList');
        const aContexts = oList.getSelectedContexts();

        if (aContexts.length !== 1) {
          MessageToast.show('Please select one author to edit.');
          return;
        }

        this._oEditContext = aContexts[0];
        const oData = this._oEditContext.getObject();

        this.getView().getModel('view').setProperty('/dialogMode', 'edit');
        this.getView()
          .getModel('view')
          .setProperty('/dialogTitle', 'Edit Author');

        if (!this._oAuthorDialog) {
          this._oAuthorDialog = await Fragment.load({
            id: this.getView().getId(),
            name: 'fiori.research.view.AuthorDialog',
            controller: this,
          });
          this.getView().addDependent(this._oAuthorDialog);
        }
        const sFragId = this.getView().getId();
        Fragment.byId(sFragId, 'nameInput').setValue(oData.name);
        Fragment.byId(sFragId, 'bioInput').setValue(oData.bio);
        this._oAuthorDialog.open();
      },

      onDeleteAuthor: function () {
        const oList = this.byId('authorList');
        const aContexts = oList.getSelectedContexts();

        if (aContexts.length !== 1) {
          MessageToast.show('Please select one author to delete.');
          return;
        }

        // Confirm with the user
        MessageBox.confirm('Are you sure you want to delete this author?', {
          actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
          onClose: async function (sAction) {
            if (sAction !== MessageBox.Action.OK) {
              return;
            }

            const oContext = aContexts[0];

            try {
              // Perform the delete on the context
              this._performSoftDelete(oContext, 'Authors');

              MessageToast.show('Author deleted successfully.');

              // Refresh the list & clear books table
              this._refreshAuthorList();
              this._bindBooks(null);
            } catch (oError) {
              MessageToast.show(
                'Error deleting author: ' + (oError.message || oError)
              );
            }
          }.bind(this),
        });
      },

      onBookSelectionChange: function () {
        const oTable = this.byId('booksTable');
        const oBookSelected = oTable.getSelectedItem();

        // update our view‐model flag
        this.getView()
          .getModel('view')
          .setProperty('/bookSelected', oBookSelected !== null);
      },

      onAddBook: async function () {
        this.getView().getModel('view').setProperty('/dialogMode', 'create');
        this.getView().getModel('view').setProperty('/dialogTitle', 'New Book');
        if (!this._oBookDialog) {
          this._oBookDialog = await Fragment.load({
            id: this.getView().getId(),
            name: 'fiori.research.view.BookDialog',
            controller: this,
          });
          this.getView().addDependent(this._oBookDialog);
        }
        this._oBookDialog.open();
      },

      onDialogBookConfirm: async function () {
        const oModel = this.getView().getModel();
        const oViewModel = this.getView().getModel('view');
        const sViewId = this.getView().getId();

        const sMode = oViewModel.getProperty('/dialogMode');
        const sTitle = Fragment.byId(sViewId, 'titleInput').getValue().trim();
        const sDescr = Fragment.byId(sViewId, 'descrInput').getValue().trim();
        let iStock = Fragment.byId(sViewId, 'stockInput').getValue().trim();
        const fPrice = Fragment.byId(sViewId, 'priceInput').getValue().trim();
        const sCurrency = Fragment.byId(sViewId, 'currencyInput')
          .getValue()
          .trim()
          .toUpperCase();

        const sAuthorId = this._sSelectedAuthorId;
        iStock = parseInt(iStock, 10);

        const bodyData = {
          author_ID: sAuthorId,
          title: sTitle,
          descr: sDescr,
          stock: iStock,
          price: fPrice,
          currency: { code: sCurrency },
        };
        try {
          if (sMode === 'create') {
            // CREATE
            const oListBinding = oModel.bindList('/Books');
            await oListBinding.create(bodyData).created();
            MessageToast.show('Book created');
          } else {
            // EDIT
            const oContext = this._oEditContext;
            await oContext.setProperty('title', sTitle);
            await oContext.setProperty('descr', sDescr);
            await oContext.setProperty('stock', iStock);
            await oContext.setProperty('price', fPrice);
            await oContext.setProperty('currency_code', sCurrency);
            await oModel.submitBatch(oModel.getUpdateGroupId());
            MessageToast.show('Book updated');
          }
          this._closeAndDestroyDialog();
          this._refreshBooks();
        } catch (oError) {
          MessageBox.error(oError.message || 'Operation failed');
        }
      },

      onEditBook: async function () {
        const oList = this.byId('booksTable');
        const aContexts = oList.getSelectedContexts();

        if (aContexts.length !== 1) {
          MessageToast.show('Please select one book to edit.');
          return;
        }

        this._oEditContext = aContexts[0];
        const oData = this._oEditContext.getObject();

        this.getView().getModel('view').setProperty('/dialogMode', 'edit');
        this.getView()
          .getModel('view')
          .setProperty('/dialogTitle', 'Edit Book');

        if (!this._oBookDialog) {
          this._oBookDialog = await Fragment.load({
            id: this.getView().getId(),
            name: 'fiori.research.view.BookDialog',
            controller: this,
          });
          this.getView().addDependent(this._oBookDialog);
        }
        const sFragId = this.getView().getId();
        Fragment.byId(sFragId, 'titleInput').setValue(oData.title);
        Fragment.byId(sFragId, 'descrInput').setValue(oData.descr);
        Fragment.byId(sFragId, 'stockInput').setValue(oData.stock);
        Fragment.byId(sFragId, 'priceInput').setValue(oData.price);
        Fragment.byId(sFragId, 'currencyInput').setValue(oData.currency_code);
        this._oBookDialog.open();
      },

      onDeleteBook: function () {
        const oList = this.byId('booksTable');
        const aContexts = oList.getSelectedContexts();

        if (aContexts.length !== 1) {
          MessageToast.show('Please select one book to delete.');
          return;
        }

        // Confirm with the user
        MessageBox.confirm('Are you sure you want to delete this book?', {
          actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
          onClose: async function (sAction) {
            if (sAction !== MessageBox.Action.OK) {
              return;
            }

            const oContext = aContexts[0];

            try {
              // Perform the delete on the context
              this._performHardDelete(oContext, 'Books');

              MessageToast.show('Book deleted successfully.');

              // Refresh the list & clear books table
              this._refreshAuthorList();
              this._bindBooks(null);
            } catch (oError) {
              MessageToast.show(
                'Error deleting book: ' + (oError.message || oError)
              );
            }
          }.bind(this),
        });
      },

      _closeAndDestroyDialog: function () {
        // Close and destroy Author dialog
        if (this._oAuthorDialog) {
          this._oAuthorDialog.close();
          this._oAuthorDialog.destroy();
          this._oAuthorDialog = null;
        }

        // Close and destroy Book dialog
        if (this._oBookDialog) {
          this._oBookDialog.close();
          this._oBookDialog.destroy();
          this._oBookDialog = null;
        }

        // Clear edit context (common cleanup)
        this._oEditContext = null;
      },

      _refreshAuthorList: function () {
        const oList = this.byId('authorList');
        const oBinding = oList && oList.getBinding('items');
        if (oBinding) {
          oBinding.refresh();
        }
      },

      _refreshBooks: function () {
        const oTable = this.byId('booksTable');
        const oBinding = oTable.getBinding('items');
        if (oBinding) {
          oBinding.refresh();
        }
      },

      _performSoftDelete: async function (oContext, sEntitySet) {
        await oContext.setProperty('isDeleted', true);
        // refresh the correct list
        if (sEntitySet === 'Authors') {
          this._refreshAuthorList();
          this._bindBooks(null);
        } else if (sEntitySet === 'Books') {
          this._bindBooks(this._sSelectedAuthorId);
        }
      },

      _performHardDelete: async function (oContext, sEntitySet) {
        await oContext.delete();
        // refresh the correct list
        if (sEntitySet === 'Authors') {
          this._refreshAuthorList();
          this._bindBooks(null);
        } else if (sEntitySet === 'Books') {
          this._bindBooks(this._sSelectedAuthorId);
        }
      },
    });
  }
);
