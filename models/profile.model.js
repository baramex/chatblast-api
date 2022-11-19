const { Schema, model, Types } = require("mongoose");
const bcrypt = require('bcrypt');
const { Integration } = require("./integration.model");
const { default: isEmail } = require("validator/lib/isEmail");

const USERS_TYPE = {
    DEFAULT: 0,
    ANONYME: 1,
    OAUTHED: 2
};
const USER_PERMISSIONS = {
    ALL: 0,
    VIEW_USER_INTEGRATIONS: 1,
    VIEW_USER_INVOICES: 2,
    VIEW_USER_SUBSCRIPTIONS: 3,
    VIEW_CONTACTS: 4,
    VIEW_USER_SUPPORTS: 5,
    DELETE_OTHER_MESSAGES: 6,
    ANSWER_CONTACTS: 7,
    ANSWER_USER_SUPPORTS: 8,
    EDIT_USER_INTEGRATIONS: 9,
}
const USERNAMES_NOT_ALLOWED = ["system"];
const FIELD_REGEX = /^[a-z0-9]{2,32}$/;
const NAME_REGEX = /^[A-ZÀ-ÿ][a-zà-ÿ]{1,31}$/;
const LASTNAME_REGEX = /^[A-Zà-ÿ]{2,32}$/;
const AVATAR_MIME_TYPE = ["image/png", "image/jpeg", "image/jpg"];
const AVATAR_TYPE = [".png", ".jpeg", ".jpg"];
const REFERRAL_CODE_REGEX = /^[a-z0-9]{12}$/;

const profileSchema = new Schema({
    userId: { type: String },
    name: {
        type: {
            firstname: { type: String, required: true, validate: NAME_REGEX },
            lastname: { type: String, required: true, validate: LASTNAME_REGEX },
            _id: false
        }
    },
    email: {
        type: {
            isVerified: { type: Boolean, default: false },
            address: { type: String, trim: true, lowercase: true, required: true, validate: { validator: isEmail, message: "L'adresse email est invalide." } },
            _id: false
        }
    },
    affiliateCode: { type: String, trim: true, validate: e => !e || REFERRAL_CODE_REGEX.test(e) },
    username: { type: String, lowercase: true, trim: true, required: true, validate: FIELD_REGEX },
    password: { type: String, trim: true },
    permissions: { type: [{ type: Number, min: 0, max: Object.values(USER_PERMISSIONS).length - 1 }], default: [], required: true },
    integrationId: { type: Types.ObjectId },
    integrations: { type: [Types.ObjectId], default: [], required: true },
    type: { type: Number, default: USERS_TYPE.DEFAULT, min: 0, max: Object.values(USERS_TYPE).length - 1, required: true },
    date: { type: Date, default: Date.now, required: true }
});

profileSchema.path("username").validate(async function (v) {
    if (!(await Profile.usernameExists(this.type, v, this.integrationId, this._id)) && !USERNAMES_NOT_ALLOWED.includes(v)) return true;
    throw new Error("Le nom d'utilisateur existe déjà.");
});

profileSchema.path("userId").validate(async function (v) {
    return (v && this.isNew) ? !await profileModel.exists({ userId: v }) : true;
});

profileSchema.path("email.address").validate(async function (v) {
    const parent = this.parent();
    if (v ? !await profileModel.exists({ "email.address": v, _id: { $ne: parent._id } }) && parent.type == USERS_TYPE.DEFAULT : true) return true;
    throw new Error("L'adresse email existe déjà.");
});

profileSchema.post("validate", function (doc, next) {
    if (this.isModified("email.address") && this.email) {
        this.email.isVerified = false;
    }
    next();
});

const profileModel = model("Profile", profileSchema, "profiles");

class Profile {
    static create(username, password, id, integrationId, type, email, firstname, lastname, affiliateCode) {
        return new Promise(async (res, rej) => {
            new profileModel({
                username, password: password ? await bcrypt.hash(password, 10) : undefined, userId: id, integrationId, affiliateCode, integrations: integrationId ? [integrationId] : undefined, type, ...(email ? { email: { address: email } } : {}), ...((firstname && lastname) ? { name: { firstname, lastname } } : {})
            }).save().then(res).catch((error) => {
                if (error.errors) {
                    return rej(new Error(Object.values(error.errors)[0].message));
                }
                rej(error);
            });
        });
    }

    static isComplete(profile) {
        return profile.email && profile.email.isVerified && profile.name && profile.name.firstname && profile.name.lastname;
    }

    static hasPermission(profile, ...permissions) {
        return permissions.every(p => profile.permissions.includes(p)) || profile.permissions.includes(USER_PERMISSIONS.ALL);
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

    static getByAffiliateCode(code) {
        return profileModel.find({ affiliateCode: code });
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
            email: isMe ? profile.email : undefined,
            name: isMe ? profile.name : undefined,
            affiliateCode: isMe ? profile.affiliateCode : undefined,
            permissions: profile.permissions,
            type: profile.type,
            date: profile.date
        };
    }
}

module.exports = { Profile, USERS_TYPE, FIELD_REGEX, AVATAR_MIME_TYPE, AVATAR_TYPE, USER_PERMISSIONS, NAME_REGEX, LASTNAME_REGEX, REFERRAL_CODE_REGEX };