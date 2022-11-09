const { ObjectId } = require("mongodb");
const { Schema, model } = require("mongoose");
const { paypal } = require("../server");
const Module = require("./module.model");
const { Profile } = require("./profile.model");
const Subscription = require("./subscription.model");

const ARTICLES_TYPE = {
    PLAN: 0,
    PRODUCT: 1
}

const articleSchema = new Schema({
    name: { type: String, required: true },
    price: { type: Number, min: 0 },
    product: { type: ObjectId, ref: "Article" },
    freeTrial: { type: Boolean, default: false, required: true },
    quantity: { type: Number, min: 1, default: 1, required: true },
    paypalPlanId: { type: String },
    type: { type: Number, min: 0, max: Object.values(ARTICLES_TYPE).length - 1, required: true },
    date: { type: Date, default: Date.now, required: true }
});

const ArticleModel = model("Article", articleSchema, "articles");

class Article {
    static create(name, type, price, quantity, freeTrial, productId) {
        return new ArticleModel({ name, price, type, quantity, freeTrial, product: productId }).save();
    }

    static getById(id) {
        return ArticleModel.findById(id);
    }

    static async createSubscription(article, subscriber, modules = [], additionalSites = 0) {
        if (!Profile.isComplete(subscriber)) throw new Error("Votre profil n'est pas complet ou l'email n'est pas vérifiée.");
        if (article.type != ARTICLES_TYPE.PLAN) throw new Error("L'article n'est pas un plan.");

        for (const i in modules) {
            modules[i] = await Module.getById(modules[i]).select("price");
        }
        modules = modules.filter(a => a);

        if (!article.paypalPlanId) {
            const product = await paypal.authenticatedRequest("POST", "/catalogs/products", {
                id: article.product._id,
                name: article.product.name,
                type: "SERVICE",
                home_url: "https://chatblast.io"
            });

            const plan = await paypal.authenticatedRequest("POST", "/billing/plans", {
                product_id: product.id,
                name: article.name,
                status: "ACTIVE",
                billing_cycles: [
                    {
                        frequency: {
                            interval_unit: "MONTH",
                            interval_count: 1
                        },
                        tenure_type: "REGULAR",
                        sequence: 1,
                        pricing_scheme: {
                            fixed_price: {
                                value: article.price,
                                currency_code: "EUR"
                            }
                        },
                        total_cycles: 0
                    }
                ],
                payment_preferences: {
                    auto_bill_outstanding: true,
                    payment_failure_threshold: 1
                },
                taxes: {
                    percentage: "20",
                    inclusive: false
                },
                quantity_supported: true
            });

            article.paypalPlanId = plan.id;
            article.save();
        }

        const firstSub = !await Subscription.hasSubscriber(subscriber._id);
        const freeTrial = article.freeTrial && firstSub;

        const subscription = await paypal.authenticatedRequest("POST", "/billing/subscriptions", {
            plan_id: article.paypalPlanId,
            plan: {
                billing_cycles: [
                    ...(freeTrial ? [{
                        frequency: {
                            interval_unit: "WEEk",
                            interval_count: 1
                        },
                        tenure_type: "TRIAL",
                        sequence: 1,
                        total_cycles: 1
                    }] : []),
                    {
                        frequency: {
                            interval_unit: "MONTH",
                            interval_count: 1
                        },
                        tenure_type: "REGULAR",
                        sequence: freeTrial ? 2 : 1,
                        pricing_scheme: {
                            fixed_price: {
                                value: article.price + modules.reduce((a, b) => a + b.price, 0),
                                currency_code: "EUR"
                            }
                        },
                        total_cycles: 0
                    }
                ]
            },
            application_context: {
                brand_name: "ChatBlast",
                cancel_url: `${process.env.API_HOST}/payment/cancel`,
                return_url: `${process.env.API_HOST}/payment/return`,
                user_action: "SUBSCRIBE_NOW"
            },
            subscriber: {
                email_address: subscriber.email.address,
                name: {
                    given_name: subscriber.name.fistname,
                    surname: subscriber.name.lastname
                },
                payer_id: subscriber._id
            },
            quantity: (additionalSites + 1).toString()
        });

        return subscription;
    }
}

module.exports = Article;