const { ObjectId } = require("mongodb");
const { Schema, model } = require("mongoose");
const PDFDocuemnt = require("pdfkit");

const INVOICES_TYPE = {
    PENDING: 0,
    PAID: 1,
    ERRORED: 2,
    REFUNDED: 3
};

const InvoiceTypesNames = [
    { text: "En cours de traitement", color: "#cc6600" },
    { text: "Payée", color: "#05BB2A" },
    { text: "Erreur", color: "#BB0505" },
    { text: "Remboursée", color: "#0000ff" }
]

const invoiceSchema = new Schema({
    profile: { type: ObjectId, ref: "Profile", required: true },
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
    currency: { type: String, required: true },
    state: { type: Number, min: 0, max: Object.values(INVOICES_TYPE).length - 1, required: true },
    date: { type: Date, default: Date.now }
});

const InvoiceModel = model("Invoice", invoiceSchema, "invoices");

class Invoice {
    static create(profileId, articles, vat, currency, state) {
        return new InvoiceModel({ profile: profileId, articles, vat, currency, state }).save();
    }

    /**
     * 
     * @param {ObjectId} id 
     * @returns 
     */
    static getById(id) {
        return InvoiceModel.findById(id);
    }

    /**
     * 
     * @param {ObjectId} profileId 
     * @returns 
     */
    static getByProfile(profileId) {
        return InvoiceModel.find({ profile: profileId });
    }

    static exportToPdf(invoice) {
        const doc = new PDFDocuemnt();

        doc.image("./images/logo.png", 40, 20, { width: 60 });
        doc.font("Helvetica-Bold", 25).fillColor("#059669").text("ChatBlast", 100, 50, { baseline: "middle" });

        doc.rect(50, 85, doc.page.width - 100, 90).fill("#d1fae5");

        assembleTexts(doc, 60, 95, { text: "Référence la de facture: " }, { text: invoice._id.toString(), font: "Helvetica-Bold" });
        assembleTexts(doc, 60, 115, { text: "État de la facture: " }, { ...InvoiceTypesNames[invoice.state], font: "Helvetica-Bold" });
        assembleTexts(doc, 60, 135, { text: "Date: " }, { text: invoice.date.toLocaleDateString("fr-FR"), font: "Helvetica-Bold" });
        assembleTexts(doc, 60, 155, { text: "Identifiant client: " }, { text: invoice.profile, font: "Helvetica-Bold" });

        const totalHT = invoice.articles.reduce((acc, article) => acc + article.quantity * article.price * (1 - article.discount / 100), 0);
        const VAT = invoice.vat * totalHT / 100;
        const totalTTC = totalHT + VAT;
        table(doc, 50, 195, doc.page.width - 100, ["Nom", "Quantité", "Prix unitaire", "Remise", "Prix total HT"], invoice.articles.map(article => [article.name, article.quantity, article.price.toFixed(2) + " " + invoice.currency, (article.discount / 100 * -article.price * article.quantity).toFixed(2) + " " + invoice.currency, (article.quantity * article.price * (1 - article.discount / 100)).toFixed(2) + " " + invoice.currency]), ["", "", "", "Sous total", totalHT.toFixed(2) + " " + invoice.currency]);

        table(doc, 50, 195 + 30 * (invoice.articles.length + 2) + 20, doc.page.width - 100, ["Total HT", "TVA (" + invoice.vat + "%)", "Total TTC"], [[totalHT, VAT, totalTTC].map(value => value.toFixed(2) + " " + invoice.currency)]);

        doc.end();
        return doc;
    }
}

function assembleTexts(doc, x, y, ...texts) {
    let bsize = 0;
    texts.forEach(t => {
        doc.font(t.font || "Helvetica", t.size || 12).fillColor(t.color || "#033B1E").text(t.text, x + bsize, y, t.options);
        bsize += doc.widthOfString(t.text);
    });
}

function table(doc, x, y, w, header, entries, footer) {
    doc.rect(x, y, w, 30).fill("#a7f3d0");
    header.forEach((h, i) => {
        if (h) doc.font("Helvetica-Bold", 12).fillColor("#033B1E").text(h, x + (i * w / header.length), y + 15, { width: w / header.length, align: "center", baseline: "middle" });
    });

    doc.rect(x, y + 30, w, 30 * entries.length).fill("#d1fae5");
    entries.forEach((e, i) => {
        e.forEach((t, j) => {
            if (t) doc.font("Helvetica", 12).fillColor("#033B1E").text(t, x + (j * w / e.length), y + 30 + 15 + (i * 30), { width: w / e.length, align: "center", baseline: "middle" });
        });
        doc.lineCap("butt").moveTo(x, y + 30 * (i + 1)).lineTo(x + w, y + 30 * (i + 1)).stroke("#033B1E");
    });

    if (footer) {
        doc.rect(x, y + 30 * (entries.length + 1), w, 30).fill("#a7f3d0");
        doc.lineCap("butt").moveTo(x, y + 30 * (entries.length + 1)).lineTo(x + w, y + 30 * (entries.length + 1)).stroke("#033B1E");

        footer.forEach((f, i) => {
            if (f) doc.font("Helvetica-Bold", 12).fillColor("#033B1E").text(f, x + (i * w / footer.length), y + 30 * (entries.length + 1) + 15, { width: w / footer.length, align: "center", baseline: "middle" });
        });
    }
}

module.exports = Invoice;