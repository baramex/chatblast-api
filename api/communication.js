const { default: rateLimit } = require("express-rate-limit");
const { getTestMessageUrl } = require("nodemailer");
const Contact = require("../models/contact.model");
const { mail, header, footer } = require("../server");

const router = require("express").Router();

router.post("/contact", rateLimit({
    windowMs: 1000 * 60 * 5,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false
}), async (req, res) => {
    try {
        const { subject, email, message } = req.body;

        if ([subject, email, message].some(a => typeof a != "string")) throw new Error("Requête invalide.");

        await Contact.create(email, subject, message);

        await mail.transporter.sendMail({
            from: "ChatBlast <noreplay@chatblast.io>",
            to: email,
            subject: "[Contact ChatBlast] Votre message a bien été envoyé",
            text: "Votre message a bien été envoyé, nous vous répondrons dans les plus brefs délais.\n\nRécapitulatif:\nSujet: " + subject + "\nMessage: " + message,
            html: header +
                `<p>Votre message a bien été envoyé, nous vous répondrons dans les plus brefs délais.</p><br/>
                <p>Récapitulatif:</p>
                <table>
                    <tr>
                        <td style="width: 100px;padding: 5px 0;">Sujet:</td>
                        <td>${subject}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0;">Message:</td>
                        <td>${message}</td>
                    </tr>
                </table>`
                + footer
        });

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

module.exports = router;