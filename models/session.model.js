const { Schema, model, default: mongoose } = require("mongoose");
const token = require("random-web-token");
const { io } = require("../server");
const { Integration, INTEGRATIONS_TYPE } = require("./integration.model");
const { Profile, USERS_TYPE } = require("./profile.model");
const { ObjectId } = mongoose.Types;

const session = new Schema({
    token: { type: String },
    profileId: { type: ObjectId, required: true, unique: true },
    ips: { type: [String], required: true },
    fingerprints: { type: [String], required: true },
    active: { type: Boolean, default: true, required: true },
    date: { type: Date, default: Date.now, required: true },
});

session.post("validate", async function (doc, next) {
    if (doc.isModified("active") || doc.isNew) {
        if (doc.active) {
            doc.token = token.genSync("extra", 30);
            doc.date = new Date();
            doc.markModified("token");
            doc.markModified("date");
        }
        else {
            doc.token = undefined;
            doc.markModified("token");

            io.to("profileid:" + doc.profileId.toString()).disconnectSockets(true);
        }
    }

    next();
});

const SessionModel = model('Session', session);

class Session {
    /**
     * 
     * @param {ObjectId} profileId 
     * @param {String} fingerprint
     * @param {String} ip 
     * @returns 
     */
    static create(profileId, fingerprint, ip) {
        return new Promise((res, rej) => {
            var doc = new SessionModel({ profileId, fingerprints: [fingerprint], ips: [ip] });
            doc.save(err => {
                if (err) rej(err);
                else res(doc);
            });
        });
    }

    static async disconnectMessage(profile, integrationId) {
        if (!profile) return;
        io.to("integrationid:" + integrationId?.toString()).emit("profile.leave", { id: profile.id, username: profile.username });
    }

    static async connectMessage(profile, integrationId) {
        if (!profile) return;
        io.to("integrationid:" + integrationId?.toString()).emit("profile.join", { id: profile.id, username: profile.username });
    }

    static disable(session) {
        session.active = false;
        return session.save({ runValidators: true });
    }

    /**
     * 
     * @param {ObjectId} id 
     * @param {String} ip 
     */
    static addIp(id, ip) {
        return SessionModel.updateOne({ _id: id }, { $addToSet: { ips: ip } });
    }

    /**
     * 
     * @param {ObjectId} id 
     * @param {String} fingerprint
     * @returns 
     */
    static addFingerprint(id, fingerprint) {
        return SessionModel.updateOne({ _id: id }, { $addToSet: { fingerprints: fingerprint } });
    }

    /**
     * 
     * @param {ObjectId} id 
     * @param {String} token 
     * @param {String} fingerprint
     */
    static getSession(token, fingerprint) {
        return SessionModel.findOne({ token, fingerprints: { $all: [fingerprint] }, active: true });
    }

    static getSessionByToken(token) {
        return SessionModel.findOne({ token, active: true });
    }

    /**
     * 
     * @param {Date} date 
     * @param {Number} expireIn 
     */
    static checkExpired(date, expireIn) {
        return new Date().getTime() - date.getTime() > expireIn * 1000;
    }

    static getSessionByProfileId(profileId) {
        return SessionModel.findOne({ profileId });
    }

    static update() {
        SessionModel.updateMany({ active: true, date: { $gt: new Date().getTime() - 1000 * 60 * 60 * 24 } }, { $set: { active: false }, $unset: { token: true } }, { runValidators: true });

        io.sockets.sockets.forEach(async socket => {
            if (socket.rooms.has("authenticated")) {
                const id = socket.profileId;
                const profile = await Profile.getProfileById(id);
                if (!profile) return socket.disconnect(true);

                const session = await Session.getSessionByProfileId(id);
                if (!session || !session.active) socket.disconnect(true);
            }
        });
    }
}

class Middleware {
    static async checkValidAuth(cookies, referer) {
        if (!cookies) throw new Error();

        const integration = await Middleware.parseIntegration(referer);
        const cookieName = (integration && (integration.type === INTEGRATIONS_TYPE.CUSTOM_AUTH || !cookies.token)) ? integration._id.toString() + "-token" : "token";

        const token = cookies[cookieName];
        if (!token) throw new Error();

        const cookieError = new Error();
        cookieError.cookieName = cookieName;

        const session = await Session.getSessionByToken(token);
        if (!session) throw cookieError;

        const profile = await Profile.getProfileById(session.profileId);
        if (!profile) throw cookieError;
        if (cookieName === "token" && profile.type !== USERS_TYPE.DEFAULT) throw new Error();

        if (integration && profile.type !== USERS_TYPE.DEFAULT && !integration._id.equals(profile.integrationId)) throw cookieError;
        if (integration && integration.type === INTEGRATIONS_TYPE.ANONYMOUS_AUTH && profile.type === USERS_TYPE.OAUTHED) throw cookieError;
        else if (integration && integration.type === INTEGRATIONS_TYPE.CUSTOM_AUTH && profile.type !== USERS_TYPE.OAUTHED) throw cookieError;
        if (!integration && profile.type !== USERS_TYPE.DEFAULT) throw cookieError;

        if (integration && !profile.integrations.includes(integration._id)) {
            profile.integrations.push(integration._id);
            profile.save();
        }

        return { profile, session, integration };
    }

    static async parseIntegration(referer) {
        const id = referer?.includes(process.env.HOST + "/integrations/") ? referer?.split("/").pop() : undefined;
        if (!ObjectId.isValid(id)) return;
        const integration = await Integration.getById(new ObjectId(id));
        return integration;
    }

    static async parseIntegrationExpress(req, res, next) {
        try {
            const integration = await Middleware.parseIntegration(req.headers.referer);
            req.integration = integration;
        }
        catch (e) {
            console.error(e);
        }
        next();
    }

    static async requiresValidAuthExpress(req, res, next) {
        try {
            const result = await Middleware.checkValidAuth(req.cookies, req.headers.referer);
            req.profile = result.profile;
            req.session = result.session;
            req.integration = result.integration;

            next();
        } catch (error) {
            console.error(error);
            if (error.cookieName) res.clearCookie(error.cookieName, { sameSite: "none", secure: "true" }).status(401).send("refresh");
            else res.sendStatus(401);
        }
    }

    static async isValidAuthExpress(req, res, next) {
        try {
            await Middleware.checkValidAuth(req.cookies, req.headers.referer);
            req.isAuthed = true;
        } catch (error) {
            req.isAuthed = false;
        }
        next();
    }
}

setInterval(Session.update, 1000 * 60 * 30);
module.exports = { Session, Middleware };