const axios = require("axios");

const URL = "https://api-m.sandbox.paypal.com/";
const VERSIONS = {
    v1: "v1",
    v2: "v2"
}

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

    /**
     * 
     * @param {import("axios").Method} method
     * @param {String} endpoint 
     * @param {Object} data 
     * @param {import("axios").AxiosRequestConfig} config 
     */
    async authenticatedRequest(method, endpoint, data, config, version = VERSIONS.v1) {
        if (this.isExpired()) await this.connect();

        return axios({ method, url: `${URL}${version}${endpoint}`, data, ...config, headers: { Authorization: this.authorization, "content-type": "application/json", ...(config.headers || {}) } });
    }
}

module.exports = Paypal;