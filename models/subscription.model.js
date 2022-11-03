const { ObjectId } = require("mongodb");
const { Schema, model } = require("mongoose");

const SUBSCRIPTIONS_STATE = {
    UNACTIVE: 0,
    ACTIVE: 1,
    EXPIRED: 2
}

const subscriptionSchema = new Schema({
    profile: { type: ObjectId, ref: "Profile", required: true },
    article: { type: ObjectId, ref: "Article", required: true },
    state: { type: Number, min: 0, max: Object.values(SUBSCRIPTIONS_STATE).length - 1, required: true },
    autorenew: { type: Boolean, default: true, required: true },
    expires: { type: Date, required: true },
    date: { type: Date, default: Date.now, required: true }
});

const SubscriptionModel = model("Subscription", subscriptionSchema, "subscriptions");

class Subscription {
    static create(profileId, articleId, state, autorenew, expires) {
        return new SubscriptionModel({ profile: profileId, article: articleId, state, autorenew, expires }).save();
    }
}

module.exports = Subscription;