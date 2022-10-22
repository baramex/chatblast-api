const { Schema, model, Types } = require("mongoose");

const INVOICES_TYPE = {
    PENDING: 0,
    PAID: 1,
    ERRORED: 2,
    REFUNDED: 3
};

const invoiceSchema = new Schema({
    profile: { type: Types.ObjectId, ref: "Profile", required: true },
    articles: {
        type: [{
            name: { type: String, required: true },
            quantity: { type: Number, min: 1, default: 1, required: true },
            price: { type: Number, min: 0, required: true },
            discount: { type: Number, min: 0, max: 100, default: 0, required: true },
        }],
        required: true
    },
    vat: { type: Number, min: 0, max: 100, required: true },
    state: { type: Number, min: 0, max: Object.values(INVOICES_TYPE).length - 1, required: true },
    date: { type: Date, default: Date.now }
});

const InvoiceModel = model("Invoice", invoiceSchema, "invoices");

class Invoice {
    static create(profileId, articles, vat, state) {
        return new InvoiceModel({ profile: profileId, articles, vat, state }).save();
    }

    /**
     * 
     * @param {Types.ObjectId} profileId 
     * @returns 
     */
    static getByProfile(profileId) {
        return InvoiceModel.find({ profile: profileId });
    }
}

module.exports = { Invoice };