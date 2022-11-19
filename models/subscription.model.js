const { ObjectId } = require("mongodb");
const { Schema, model } = require("mongoose");
const { REFERRAL_CODE_REGEX } = require("./profile.model");

const SUBSCRIPTIONS_STATE = {
    UNACTIVE: 0,
    ACTIVE: 1,
    EXPIRED: 2
}

const subscriptionSchema = new Schema({
    profile: { type: ObjectId, ref: "Profile", required: true },
    plan: { type: ObjectId, ref: "Article", required: true },
    paypalSubscriptionId: { type: String, required: true },
    state: { type: Number, min: 0, max: Object.values(SUBSCRIPTIONS_STATE).length - 1, required: true },
    autorenew: { type: Boolean, default: true, required: true },
    expires: { type: Date, required: true },
    affiliateCode: { type: String, validate: a => !a || REFERRAL_CODE_REGEX.test(a) },
    additionalSites: { type: Number, min: 0, default: 0, required: true },
    modules: { type: [ObjectId], ref: "Module", default: [], required: true },
    date: { type: Date, default: Date.now, required: true }
});

subscriptionSchema.virtual("price").get(function () {
    return (this.plan.price + this.modules.map(m => m.price).reduce((a, b) => a + b, 0)) * (this.additionalSites + 1);
});

const SubscriptionModel = model("Subscription", subscriptionSchema, "subscriptions");

class Subscription {
    static create(profileId, planId, state, paypalSubscriptionId, expires, additionalSites, modules, autorenew) {
        return new SubscriptionModel({ profile: profileId, plan: planId, state, paypalSubscriptionId, additionalSites, modules, autorenew, expires }).save();
    }

    static getBySubscriber(profileId) {
        return SubscriptionModel.find({ profile: profileId });
    }

    static hasSubscriber(profileId) {
        return SubscriptionModel.exists({ profile: profileId });
    }

    static getSubscriptionFields(doc) {
        return {
            _id: doc._id,
            profile: doc.profile,
            plan: doc.plan,
            state: doc.state,
            autorenew: doc.autorenew,
            expires: doc.expires,
            date: doc.date
        }
    }

    static getByAffiliateCode(code) {
        return SubscriptionModel.find({ affiliateCode: code });
    }
}

module.exports = Subscription;