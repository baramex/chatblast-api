const { Schema, model } = require("mongoose");
const { default: isEmail } = require("validator/lib/isEmail");

const CONTACTS_STATE = {
    PENDING: 0,
    ANSWERED: 1
}

const contactSchema = new Schema({
    email: { type: String, validate: isEmail, required: true },
    subject: { type: String, minlength: 1, maxlength: 50, required: true },
    message: { type: String, minlength: 1, maxlength: 1000, required: true },
    answer: { type: String, minlength: 1, maxlength: 1000 },
    state: { type: Number, min: 0, max: Object.values(CONTACTS_STATE).length - 1, default: CONTACTS_STATE.PENDING, required: true },
    date: { type: Date, default: Date.now, required: true }
});

contactSchema.pre("save", function (next) {
    if (this.answer && this.state === CONTACTS_STATE.PENDING) this.state = CONTACTS_STATE.ANSWERED;
    this.markModified("state");
    next();
});

const ContactModel = model("Contact", contactSchema, "contacts");

class Contact {
    static create(email, subject, message, state = CONTACTS_STATE.PENDING) {
        return new ContactModel({ email, subject, message, state }).save();
    }

    static getAll() {
        return ContactModel.find({}, { message: 0 });
    }

    static getById(id) {
        return ContactModel.findById(id);
    }
}

module.exports = { Contact, CONTACTS_STATE };