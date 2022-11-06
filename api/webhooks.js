const { webhooks } = require('../modules/Paypal');
const { paypal } = require('../server');

const router = require('express').Router();

async function WebhookValidator(req, res, next) {
    const sig = req.headers['PAYPAL-TRANSMISSION-SIG'];
    const algo = req.headers['PAYPAL-AUTH-ALGO'];
    const certUrl = req.headers['PAYPAL-CERT-URL'];

    const id = req.headers['PAYPAL-TRANSMISSION-ID'];
    const timestamp = req.headers['PAYPAL-TRANSMISSION-TIME'];
    const webhookId = webhooks.find(a => a.url === process.env.API_HOST + req.originalUrl).id;

    try {
        const res = await paypal.authenticatedRequest("POST", "/notifications/verify-webhook-signature", { auth_algo: algo, transmission_id: id, cert_url: certUrl, transmission_sig: sig, transmission_time: timestamp, webhook_id: webhookId, webhook_event: req.body });
        if (res.verification_status === 'SUCCESS') next();
        else throw new Error("Invalid signature");
    } catch (error) {
        console.error(error);
        res.sendStatus(401);
    }
}

router.post("/webhooks/paypal/subscription/payment", WebhookValidator, async (req, res) => {
    console.log("webhook payment", req.body);
    res.sendStatus(200);
});

module.exports = router;