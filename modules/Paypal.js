const axios = require("axios");

const URL = "https://api-m.sandbox.paypal.com/";
const VERSIONS = {
    v1: "v1",
    v2: "v2"
};

const webhooks = [
    {
        id: "subscription.payment",
        event_types: [
            { name: "PAYMENT.SALE.PENDING" }, // ?
            { name: "PAYMENT.SALE.DENIED" }, // ?
            { name: "PAYMENT.SALE.REFUNDED" },
            { name: "PAYMENT.SALE.REVERSED" },
            { name: "PAYMENT.SALE.COMPLETED" },
            { name: "BILLING.SUBSCRIPTION.PAYMENT.FAILED" }, // ?
        ],
        url: process.env.API_HOST + "/webhooks/paypal/subscription/payment"
    },
    {
        id: "subscription.status",
        event_types: [
            { name: "BILLING.SUBSCRIPTION.CREATED" }, // ?
            { name: "BILLING.SUBSCRIPTION.ACTIVATED" },
            { name: "BILLING.SUBSCRIPTION.EXPIRED" },
            { name: "BILLING.SUBSCRIPTION.SUSPEND" },
            { name: "BILLING.SUBSCRIPTION.CANCELLED" },
        ],
        url: process.env.API_HOST + "/webhooks/paypal/subscription/status"
    }
];

class Paypal {
    constructor(client_id, client_secret) {
        this.client_id = client_id;
        this.client_secret = client_secret;
    }

    get authorization() {
        return `${this.token_type} ${this.access_token}`;
    }

    isExpired() {
        return Date.now() + this.expires_in * 1000 < Date.now();
    }

    async connect() {
        const auth = await axios.post(`${URL}${VERSIONS.v1}/oauth2/token`, "grant_type=client_credentials", { auth: { username: this.client_id, password: this.client_secret }, headers: { "content-type": "application/x-www-form-urlencoded" } });

        this.access_token = auth.data.access_token;
        this.token_type = auth.data.token_type;
        this.expires_in = auth.data.expires_in;
    }

    async initWebhooks() {
        const data = await this.authenticatedRequest("GET", "/notifications/webhooks");

        for (const webhook of webhooks) {
            const curr = data.webhooks.find(w => w.id === webhook.id);

            if (curr) {
                const up = [];

                if (curr.event_types.length !== webhook.event_types.length || !webhook.event_types.every(a => curr.event_types.some(b => b.name === a.name))) {
                    up.push({
                        op: "add",
                        path: "/event_types",
                        value: webhook.event_types
                    });
                }

                if (curr.url !== webhook.url) up.push({ op: "replace", path: "/url", value: webhook.url });

                if (up.length > 0) await this.authenticatedRequest("PATCH", "/notifications/webhooks/" + curr.id, up);
            }
            else {
                await this.authenticatedRequest("POST", "/notifications/webhooks", webhook);
            }
        }
    }

    /**
     * 
     * @param {import("axios").Method} method
     * @param {String} endpoint 
     * @param {Object} data 
     * @param {import("axios").AxiosRequestConfig} config 
     */
    async authenticatedRequest(method, endpoint, data, config, version = VERSIONS.v1) {
        if (this.isExpired()) await this.connect();

        return (await axios({ method, url: `${URL}${version}${endpoint}`, data, ...config, headers: { Authorization: this.authorization, "content-type": "application/json", ...(config?.headers || {}) } })).data;
    }
}

module.exports = { Paypal, webhooks };