const { ObjectId } = require("mongodb");
const { Schema, model } = require("mongoose");

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
    additionalSites: { type: Number, min: 0, default: 0, required: true },
    modules: { type: [ObjectId], ref: "Module", default: [], required: true },
    date: { type: Date, default: Date.now, required: true }
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
}

module.exports = Subscription;