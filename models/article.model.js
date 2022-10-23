const { Schema, model } = require("mongoose");

const ARTICLES_TYPE = {
    plan: 0
}

const articleSchema = new Schema({
    name: { type: String, required: true },
    price: { type: Number, min: 0, required: true },
    type: { type: Number, min: 0, max: Object.values(ARTICLES_TYPE).length - 1, required: true },
    date: { type: Date, default: Date.now }
});

const ArticleModel = model("Article", articleSchema, "articles");

class Article {
    static create(name, price, type) {
        return new ArticleModel({ name, price, type }).save();
    }
}

module.exports = Article;