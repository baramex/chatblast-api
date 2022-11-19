const { Schema, model, Types } = require("mongoose");
const { genSync } = require("random-web-token");
const { default: isEmail } = require("validator/lib/isEmail");
const { REFERRAL_CODE_REGEX } = require("./profile.model");
const Subscription = require("./subscription.model");

const affiliateSchema = new Schema({
    profile: { type: Types.ObjectId, ref: "Profile", required: true },
    code: { type: String, default: () => genSync("medium", 12), required: true, unique: true, validate: REFERRAL_CODE_REGEX },
    paypalEmail: { type: String, validate: isEmail, required: true },
    date: { type: Date, default: Date.now, required: true }
});

const AffiliateModel = model("Affiliate", affiliateSchema, "affiliates");

class Affiliate {
    static create(profileId, paypalEmail) {
        return new AffiliateModel({ profile: profileId, paypalEmail }).save();
    }

    static exists(code) {
        return AffiliateModel.exists({ code });
    }

    static getByCode(code) {
        return AffiliateModel.findOne({ code });
    }

    static getByProfile(profileId) {
        return AffiliateModel.findOne({ profile: profileId });
    }

    static getUsers(code) {
        return Subscription.getByAffiliateCode(code).populate("profile", "username").populate("plan", "price").populate("modules", "price").select("price profile.username");
    }
}

module.exports = { Affiliate, REFERRAL_CODE_REGEX };