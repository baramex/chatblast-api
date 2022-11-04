const { ObjectId } = require("mongodb");
const { Schema, model } = require("mongoose");
const token = require("random-web-token");

const VERIFICATIONS_TYPE = {
    EMAIL: 0,
    DOMAIN: 1
}

const verificationSchema = new Schema({
    ref: { type: ObjectId, required: true },
    type: { type: Number, min: 0, max: Object.values(VERIFICATIONS_TYPE).length - 1, required: true },
    code: { type: String, default: () => token.genSync("extra", 25), required: true },
    expires: { type: Date, default: () => Date.now() + 1000 * 60 * 15, expires: 0, required: true },
    date: { type: Date, default: Date.now, required: true }
});

const verificationModel = model("Verification", verificationSchema, "verifications");

class Verification {
    /**
     * 
     * @param {ObjectId} ref 
     * @param {Number} type 
     * @param {Date} [expires]
     * @param {String} [code]
     * @returns 
     */
    static create(ref, type, expires, code) {
        return new verificationModel({ ref, type, expires, code }).save();
    }

    static getValideCode(ref, type, code) {
        return verificationModel.findOne({ ref, type, code, expires: { $gt: Date.now() } });
    }

    static delete(code) {
        return verificationModel.deleteOne({ code });
    }
}

module.exports = { Verification, VERIFICATIONS_TYPE };