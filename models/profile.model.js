const { Schema, model, Types } = require("mongoose");
const bcrypt = require('bcrypt');
const { Integration } = require("./integration.model");
const { default: isEmail } = require("validator/lib/isEmail");

const USERS_TYPE = {
    DEFAULT: 0,
    ANONYME: 1,
    OAUTHED: 2
};
const USERNAMES_NOT_ALLOWED = ["system"];
const FIELD_REGEX = /^[a-z0-9]{1,32}$/;
const AVATAR_MIME_TYPE = ["image/png", "image/jpeg", "image/jpg"];
const AVATAR_TYPE = [".png", ".jpeg", ".jpg"];

const profileSchema = new Schema({
    userId: { type: String },
    email: {
        type: {
            isVerified: { type: Boolean, default: false },
            address: { type: String, trim: true, lowercase: true, validate: isEmail },
            verificationCode: { type: String },
            _id: false
        }
    },
    username: { type: String, lowercase: true, trim: true, required: true, validate: FIELD_REGEX },
    password: { type: String, trim: true },
    integrationId: { type: Types.ObjectId },
    integrations: { type: [Types.ObjectId], default: [] },
    type: { type: Number, default: USERS_TYPE.DEFAULT, min: 0, max: Object.values(USERS_TYPE).length - 1 },
    date: { type: Date, default: Date.now }
});

profileSchema.path("username").validate(async function (v) {
    return !(await Profile.usernameExists(this.type, v, this.integrationId, this._id)) && !USERNAMES_NOT_ALLOWED.includes(v);
});

profileSchema.path("userId").validate(async function (v) {
    return (v && this.isNew) ? !await profileModel.exists({ userId: v }) : true;
});

profileSchema.path("email.address").validate(async function (v) {   
    const parent = this.parent();
    return v ? !await profileModel.exists({ "email.address": v, _id: { $ne: parent._id } }) && parent.type == USERS_TYPE.DEFAULT : true;
});

profileSchema.post("validate", function (doc, next) {
    if (this.isModified("email.address")) {
        this.email.isVerified = false;
        this.email.verificationCode = undefined;
    }
    next();
});

const profileModel = model("Profile", profileSchema, "profiles");

class Profile {
    static create(username, password, id, integrationId, type, email) {
        return new Promise(async (res, rej) => {
            new profileModel({ username, password: password ? await bcrypt.hash(password, 10) : undefined, userId: id, integrationId, integrations: integrationId ? [integrationId] : undefined, type, "email.address": email }).save().then(res).catch((error) => {
                if (error.code == 11000 && error.keyPattern.username) rej(new Error("Un compte est déjà asssocié à ce nom d'utilisateur."));
                else rej(error);
            });
        });
    }

    static usernameExists(type, username, integrationId, id = false) {
        return type === USERS_TYPE.DEFAULT ? profileModel.exists({ username, _id: { $ne: id } }) : profileModel.findOne({ username, integrationId, _id: { $ne: id } });
    }

    static getProfileById(id) {
        return profileModel.findById(id);
    }

    static getProfileByUserId(id) {
        if (!id) return;
        return profileModel.findOne({ userId: id });
    }

    static async check(username, password) {
        if (!username || !password) return false;
        const profile = await profileModel.findOne({ $or: [{ username }, { "email.address": username }], type: USERS_TYPE.DEFAULT });
        if (!profile) return false;
        if (!profile.password) return false;
        if (await bcrypt.compare(password, profile.password)) return profile;
        return false;
    }

    static getProfileByToken(token) {
        return profileModel.findOne({ token });
    }

    static getUsernamesByIds(ids) {
        return profileModel.find({ _id: { $in: ids } }, { username: true });
    }

    static async generateUnsedUsername(type, username, integrationId) {
        let i = 0;
        while (await Profile.usernameExists(type, username, integrationId) && i < 10) {
            username += Math.floor(Math.random() * 10);
            i++;
        }
        if (i === 10) throw new Error();
        return username;
    }

    static async getBadges(profile, integration) {
        const badges = [];

        if (integration && integration.owner.equals(profile._id)) badges.push({ name: "owner", src: "/images/badges/owner.png", description: "Créateur de l'intégration" });
        if ((await Integration.getByOwner(profile._id)).length > 0) badges.push({ name: "customer", src: "/images/badges/customer.png", description: "Client de chatblast" });
        if (profile.email) badges.push({ name: "registred", src: "/images/badges/registred.png", description: "Possède un compte" });

        return badges;
    }

    static getProfileFields(profile, isMe) {
        return {
            id: profile._id,
            username: profile.username,
            email: isMe ? {
                isVerified: profile.email.isVerified,
                address: profile.email.address
            } : undefined,
            type: profile.type,
            date: profile.date
        };
    }
}

module.exports = { Profile, USERS_TYPE, FIELD_REGEX, AVATAR_MIME_TYPE, AVATAR_TYPE };