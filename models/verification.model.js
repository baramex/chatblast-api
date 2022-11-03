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
    expiresIn: { type: Number, default: 60 * 15, required: true },
    date: { type: Date, default: Date.now, required: true }
});

const verificationModel = model("Verification", verificationSchema, "verifications");

class Verification {
    /**
     * 
     * @param {ObjectId} ref 
     * @param {Number} type 
     * @param {Number} [expiresIn]
     * @param {String} [code]
     * @returns 
     */
    static create(ref, type, expiresIn, code) {
        return new verificationModel({ ref, type, expiresIn, code });
    }
}

module.exports = { Verification };