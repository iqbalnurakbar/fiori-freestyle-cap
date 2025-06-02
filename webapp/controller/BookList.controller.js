sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, MessageToast, Fragment, MessageBox) {
    "use strict";

    return Controller.extend("fiori.research.controller.BookList", {
      // ! Fragment instance for Add/Edit Author dialog (lazy‐loaded)
      _oDialog: null,

      // ! Context of the currently selected author in the master list
      _oSelectedAuthorContext: null,

      // ! Context of the author being edited; null when creating a new author
      _oEditingAuthorContext: null,

      _oBookDialog: null,
      _oSelectedBookContext: null,
      _oEditingBookContext: null,

      /**
       * @public
       * @override
       * @returns {void}
       *
       * Called once after the controller is instantiated.
       *  • Creates a JSONModel for the detail view (author name + books)
       *  • Attaches it as "view" model on the view
       */
      onInit: function () {
        const oViewModel = new JSONModel({
          selectedAuthorName: "",
          selectedAuthorBooks: [],
        });
        this.getView().setModel(oViewModel, "view");
      },

      /* =========================================================== */
      /*                  BOOK EVENT HANDLERS                        */
      /* =========================================================== */

      /**
       * Opens the Add Book dialog
       */
      onAddBook: async function () {
        if (!this._oBookDialog) {
          this._oBookDialog = await this.loadFragment({
            name: "fiori.research.view.AddBookDialog",
          });
        }
        // Reset the form fields for a new book entry
        this.getView().setModel(
          new JSONModel({
            _bookEditMode: false, // Flag to indicate create mode
            title: "",
            descr: "",
            stock: "",
            price: "",
            currency: "",
          }),
          "_bookDialog"
        );

        this._oBookDialog.open();
      },

      /**
       * Creates or updates a book under the selected author
       */

      onCreateBook: async function () {
        const sViewId = this.getView().getId();
        const oModel = this.getView().getModel();

        const sTitle = Fragment.byId(sViewId, "titleInput").getValue().trim();
        const sDescr = Fragment.byId(sViewId, "descrInput").getValue().trim();
        let iStock = Fragment.byId(sViewId, "stockInput").getValue().trim();
        const fPrice = Fragment.byId(sViewId, "priceInput").getValue().trim();
        const sCurrency = Fragment.byId(sViewId, "currencyInput")
          .getValue()
          .trim();

        if (!sTitle || !sCurrency) {
          MessageToast.show("Please fill in both Title and Currency.");
          return;
        }

        iStock = parseInt(iStock, 10);

        if (!this._oSelectedAuthorContext) {
          MessageToast.show("Please select an author first.");
          return;
        }

        try {
          if (this._oEditingBookContext) {
            // UPDATE the book
            await this._oEditingBookContext.setProperty("title", sTitle);
            await this._oEditingBookContext.setProperty("descr", sDescr);
            await this._oEditingBookContext.setProperty("stock", iStock);
            await this._oEditingBookContext.setProperty("price", fPrice);
            await this._oEditingBookContext.setProperty("currency", {
              code: sCurrency,
            });

            MessageToast.show("Book updated successfully!");
          } else {
            // CREATE a new book
            const sAuthorID =
              await this._oSelectedAuthorContext.requestProperty("ID");
            const oBooksList = oModel.bindList("/Books");
            await oBooksList
              .create({
                author_ID: sAuthorID,
                title: sTitle,
                descr: sDescr,
                stock: iStock,
                price: fPrice,
                currency: { code: sCurrency },
              })
              .created();

            MessageToast.show("Book created successfully!");
          }
        } catch (oError) {
          console.error("Book save failed:", oError);
          MessageToast.show("Failed to save book. See console for details.");
        } finally {
          this._closeAndDestroyBookDialog();
          await this._loadBooksForAuthor();
        }
      },
      onCancelAddBook: function () {
        this._closeAndDestroyBookDialog();
      },

      onBookSelectionChange: function (oEvent) {
        const oSelectedItem = oEvent.getParameter("listItem");
        console.log(oSelectedItem);
        const bSelected = !!oSelectedItem;

        if (bSelected) {
          // Store the selected item context for further actions like edit or delete
          this._oSelectedBookContext = oSelectedItem.getBindingContext("view");
          console.log(this._oSelectedBookContext);
        } else {
          this._oSelectedBookContext = null;
        }

        // Enable or disable buttons based on selection
        this.byId("editBookBtn").setEnabled(bSelected);
        this.byId("deleteBookBtn").setEnabled(bSelected);
      },

      onEditBook: async function () {
        if (!this._oSelectedBookContext) {
          MessageToast.show("Please select a book to edit.");
          return;
        }

        const oData = await this._oSelectedBookContext.getObject();
        if (!this._oBookDialog) {
          this._oBookDialog = await this.loadFragment({
            name: "fiori.research.view.AddBookDialog",
          });
        }

        const sViewId = this.getView().getId();
        Fragment.byId(sViewId, "titleInput").setValue(oData.title);
        Fragment.byId(sViewId, "descrInput").setValue(oData.descr);
        Fragment.byId(sViewId, "stockInput").setValue(oData.stock);
        Fragment.byId(sViewId, "priceInput").setValue(oData.price);
        Fragment.byId(sViewId, "currencyInput").setValue(oData.currency_code);

        this._oEditingBookContext = this._oSelectedBookContext;
        this._oBookDialog.open();
      },

      onDeleteBook: function () {
        if (!this._oSelectedBookContext) {
          MessageToast.show("Please select a book to delete.");
          return;
        }

        // Assuming you have initialized your ODataModel correctly
        const oBook = this._oSelectedBookContext.getObject();
        const sPath = `/Books(${oBook.ID})`; // OData path may depend on your setup

        MessageBox.confirm(
          `Are you sure you want to delete the book “${oBook.title}”?`,
          {
            title: "Confirm Deletion",
            actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
            onClose: (sAction) => {
              if (sAction === MessageBox.Action.OK) {
                this._oSelectedBookContext.delete();
              }
            },
          }
        );
      },

      /* =========================================================== */
      /*                    PRIVATE HELPERS                         */
      /* =========================================================== */

      _closeAndDestroyBookDialog: function () {
        if (this._oBookDialog) {
          this._oBookDialog.close();
          this._oBookDialog.destroy();
          this._oBookDialog = null;
          this._oEditingBookContext = null;
          this.getView().setModel(null, "_bookDialog");
        }
      },

      /**
       * Reloads books whenever an author is selected or after CRUD ops
       */
      _loadBooksForAuthor: async function () {
        const oDataModel = this.getView().getModel();
        const oViewModel = this.getView().getModel("view");
        const oAuthorCtx = this._oSelectedAuthorContext;

        if (!oAuthorCtx) {
          return;
        }

        const oBooksBinding = oDataModel.bindList("books", oAuthorCtx);
        const aCtxs = await oBooksBinding.requestContexts();
        const aBooks = aCtxs.map((ctx) => ctx.getObject());

        oViewModel.setProperty("/selectedAuthorBooks", aBooks);
      },

      /* =========================================================== */
      /*                      AUTHOR EVENT HANDLERS                        */
      /* =========================================================== */

      /**
       * @public
       * @param {sap.m.ListBase$SelectionChangeEvent} oEvent The selectionChange event
       * @returns {Promise<void>}
       *
       * Handles selecting an author in the master list:
       *  • Loads the author’s name
       *  • Fetches related books asynchronously
       *  • Updates the detail JSONModel
       *  • Navigates to the detail page
       */
      onAuthorSelect: async function (oEvent) {
        const oItem = oEvent.getParameter("listItem");
        if (!oItem) {
          MessageToast.show("No author selected."); // * user feedback
          return;
        }

        const oAuthorCtx = oItem.getBindingContext();
        const oDataModel = this.getView().getModel();
        const oViewModel = this.getView().getModel("view");

        try {
          // * Load selected author's name
          const sAuthorName = await oAuthorCtx.requestProperty("name");

          // * Retrieve all book contexts under this author
          const oBooksBinding = oDataModel.bindList("books", oAuthorCtx);
          const aBookCtxs = await oBooksBinding.requestContexts();
          const aBooks = aBookCtxs.map((ctx) => ctx.getObject());

          // * Update detail model
          oViewModel.setProperty("/selectedAuthorName", sAuthorName);
          oViewModel.setProperty("/selectedAuthorBooks", aBooks);
        } catch (err) {
          console.error(err);
          MessageToast.show("Error loading books. Please try again.");
        }
      },

      /**
       * @public
       * @returns {void}
       *
       * Navigates back from the detail page to the master list.
       */
      onNavBack: function () {
        this.byId("splitApp").backMaster();
      },

      /**
       * @public
       * @param {sap.m.ListBase$SelectionChangeEvent} oEvent The selectionChange event
       * @returns {void}
       *
       * Toggles the enabled state of Edit/Delete buttons
       * based on whether an author is selected in the master list.
       */
      onAuthorSelectionChange: function (oEvent) {
        const oSelected = oEvent.getParameter("listItem");
        console.log(oSelected);
        const bSelected = !!oSelected;
        this._oSelectedAuthorContext = bSelected
          ? oSelected.getBindingContext()
          : null;

        console.log(this._oSelectedAuthorContext);
        this.byId("editAuthorBtn").setEnabled(bSelected);
        this.byId("deleteAuthorBtn").setEnabled(bSelected);
      },

      /**
       * @public
       * @returns {Promise<void>}
       *
       * Opens the “Add Author” dialog. Fragment is loaded lazily
       * on the first invocation.
       */
      onAddAuthor: async function () {
        if (!this._oDialog) {
          this._oDialog = await this.loadFragment({
            name: "fiori.research.view.AddAuthorDialog",
          });
        }
        this._oDialog.open();
      },

      /**
       * @public
       * @returns {Promise<void>}
       *
       * Opens the “Edit Author” dialog pre-populated with
       * the selected author’s data. Shows a toast if none is selected.
       */
      onEditAuthor: async function () {
        if (!this._oSelectedAuthorContext) {
          MessageToast.show("Please select an author to edit.");
          return;
        }
        const oData = await this._oSelectedAuthorContext.requestObject();

        if (!this._oDialog) {
          this._oDialog = await this.loadFragment({
            name: "fiori.research.view.AddAuthorDialog",
          });
        }
        const sFragId = this.getView().getId();
        Fragment.byId(sFragId, "nameInput").setValue(oData.name);
        Fragment.byId(sFragId, "bioInput").setValue(oData.bio);

        this._oEditingAuthorContext = this._oSelectedAuthorContext;
        this._oDialog.open();
      },

      /**
       * @public
       * @returns {Promise<void>}
       *
       * Creates a new author or updates an existing one based on dialog inputs:
       *  • Performs basic validation
       *  • Shows success or error toasts
       */
      onCreateAuthor: async function () {
        const oModel = this.getView().getModel();
        const sViewId = this.getView().getId();
        const sName = Fragment.byId(sViewId, "nameInput").getValue().trim();
        const sBio = Fragment.byId(sViewId, "bioInput").getValue().trim();

        if (!sName || !sBio) {
          MessageToast.show("Please fill in both Name and Bio.");
          return;
        }

        const oListBinding = oModel.bindList("/Authors");

        try {
          if (this._oEditingAuthorContext) {
            // * Update existing author
            await this._oEditingAuthorContext.setProperty("name", sName);
            await this._oEditingAuthorContext.setProperty("bio", sBio);
            MessageToast.show("Author updated successfully!");
          } else {
            // * Create new author entry
            await oListBinding.create({ name: sName, bio: sBio }).created();
            MessageToast.show("Author created successfully!");
          }

          this._refreshAuthorList();
        } catch (err) {
          console.error(err);
          MessageToast.show("Failed to save author.");
        } finally {
          this._closeAndDestroyDialog();
        }
      },

      /**
       * @public
       * @returns {void}
       *
       * Prompts the user to confirm deletion (soft delete) of the selected author.
       */
      onDeleteAuthor: function () {
        if (!this._oSelectedAuthorContext) {
          MessageToast.show("Please select an author to delete.");
          return;
        }

        const sName = this._oSelectedAuthorContext.getObject().name || "";
        MessageBox.confirm(
          `Are you sure you want to delete author “${sName}”?`,
          {
            title: "Confirm Delete",
            actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
            emphasizedAction: MessageBox.Action.CANCEL,
            onClose: (sAction) => {
              if (sAction === MessageBox.Action.OK) {
                this._performSoftDelete();
              }
            },
          }
        );
      },

      /**
       * @public
       * @returns {void}
       *
       * Cancels Add/Edit and closes the dialog.
       */
      onCancelAddAuthor: function () {
        this._closeAndDestroyDialog();
      },

      /* =========================================================== */
      /*                     PRIVATE HELPERS                        */
      /* =========================================================== */

      /**
       * @private
       * @returns {Promise<void>}
       *
       * Marks isDeleted = true on the selected author (soft delete),
       * then refreshes the master list so the author disappears.
       */
      _performSoftDelete: async function () {
        try {
          await this._oSelectedAuthorContext.setProperty("isDeleted", true);
          MessageToast.show("Author soft-deleted successfully!");
          this.byId("editAuthorBtn").setEnabled(false);
          this.byId("deleteAuthorBtn").setEnabled(false);
          this._refreshAuthorList();
        } catch (err) {
          console.error(err);
          MessageToast.show("Failed to delete author.");
        }
      },

      /**
       * Performs a hard delete: issues an OData DELETE request for this author.
       * @private
       */
      _performHardDelete: async function () {
        try {
          // this sends DELETE /Authors(<cuid>)
          await this._oSelectedAuthorContext.delete();

          MessageToast.show("Author permanently deleted!");

          // Disable buttons until the user picks another row
          this.byId("editAuthorBtn").setEnabled(false);
          this.byId("deleteAuthorBtn").setEnabled(false);

          // Refresh the master list so the deleted author disappears
          const oList = this.byId("authorList");
          const oBinding = oList && oList.getBinding("items");
          if (oBinding) {
            oBinding.refresh();
          }
        } catch (err) {
          console.error(err);
          MessageToast.show("Failed to delete author.");
        }
      },

      /**
       * @private
       * @returns {void}
       *
       * Refreshes the Authors list binding (assumes filter isDeleted eq false).
       */
      _refreshAuthorList: function () {
        const oList = this.byId("authorList");
        const oBinding = oList && oList.getBinding("items");
        if (oBinding) {
          oBinding.refresh();
        }
      },

      /**
       * @private
       * @returns {void}
       *
       * Closes and destroys the Add/Edit dialog fragment,
       * and resets editing state.
       */
      _closeAndDestroyDialog: function () {
        if (this._oDialog) {
          this._oDialog.close();
          this._oDialog.destroy();
          this._oDialog = null;
          this._oEditingAuthorContext = null;
        }
      },

      /**
       * @public
       * @param {number} iStock The current quantity in stock
       * @returns {String}
       *
       * Formats the stock-level state to ValueState strings:
       *  • “Error” if stock is zero
       *  • “Warning” if stock is less than 10
       *  • “Success” otherwise
       */
      formatStockState: function (iStock) {
        if (iStock === 0) {
          return "Error";
        }
        if (iStock < 10) {
          return "Warning";
        }
        return "Success";
      },
    });
  }
);
