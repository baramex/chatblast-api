const { Schema, model } = require("mongoose");
const { default: isEmail } = require("validator/lib/isEmail");

const CONTACTS_STATE = {
    PENDING: 0,
    ANSWERED: 1
}

const contactSchema = new Schema({
    email: { type: String, validate: isEmail, required: true },
    subject: { type: String, maxlength: 50, required: true },
    message: { type: String, maxlength: 1000, required: true },
    state: { type: Number, min: 0, max: Object.values(CONTACTS_STATE).length - 1, default: CONTACTS_STATE.PENDING, required: true },
    date: { type: Date, default: Date.now }
});

const ContactModel = model("Contact", contactSchema, "contacts");

class Contact {
    static create(email, subject, message, state = CONTACTS_STATE.PENDING) {
        return new ContactModel({ email, subject, message, state }).save();
    }
}

module.exports = Contact;