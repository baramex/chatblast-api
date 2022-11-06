const { ObjectId } = require("mongodb");
const { Schema, model } = require("mongoose");
const { paypal } = require("../server");
const Subscription = require("./subscription.model");

const ARTICLES_TYPE = {
    PLAN: 0,
    PRODUCT: 1
}

const articleSchema = new Schema({
    name: { type: String, required: true },
    price: { type: Number, min: 0 },
    product: { type: ObjectId, ref: "Article" },
    quantity: { type: Number, min: 1, default: 1 },
    paypalPlanId: { type: String },
    type: { type: Number, min: 0, max: Object.values(ARTICLES_TYPE).length - 1, required: true },
    date: { type: Date, default: Date.now, required: true }
});

const ArticleModel = model("Article", articleSchema, "articles");

class Article {
    static create(name, type, price, quantity, productId) {
        return new ArticleModel({ name, price, type, quantity, product: productId }).save();
    }

    static getById(id) {
        return ArticleModel.findById(id);
    }

    static async createSubscription(article, subscriber) {
        if (article.type != ARTICLES_TYPE.PLAN) throw new Error("L'article n'est pas un plan");

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
                            interval_unit: "WEEk",
                            interval_count: 1
                        },
                        tenure_type: "TRIAL",
                        sequence: 1,
                        total_cycles: 1
                    },
                    {
                        frequency: {
                            interval_unit: "MONTH",
                            interval_count: 1
                        },
                        tenure_type: "REGULAR",
                        sequence: 2,
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
                }
            });

            article.paypalPlanId = plan.id;
            article.save();
        }

        const firstSub = !await Subscription.hasSubscriber(subscriber._id);

        const subscription = await paypal.authenticatedRequest("POST", "/billing/subscriptions", {
            plan_id: article.paypalPlanId,
            plan: firstSub ? undefined : {
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
                ]
            },
            application_context: {
                brand_name: "ChatBlast",
                cancel_url: `${process.env.API_HOST}/payment/cancel`,
                return_url: `${process.env.API_HOST}/payment/return`, // TODO: plus de collection invoice (sauvegardées dans paypal ? mais garder gen pdf), enregistrer les souscriptions (juste id), plusieurs souscriptions: revise quantité
                user_action: "SUBSCRIBE_NOW"
            },
            subscriber: {
                email_address: subscriber.email,
                name: {
                    given_name: subscriber.name.fistname,
                    surname: subscriber.name.lastname
                },
                payer_id: subscriber._id
            }
        });

        return subscription;
    }
}

module.exports = Article;