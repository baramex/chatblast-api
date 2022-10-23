const { Schema, model, default: mongoose } = require("mongoose");
const { io } = require("../server");
const { ObjectId } = mongoose.Types;

const messageSchema = new Schema({
    author: { type: ObjectId, ref: "Profile", required: true },
    content: { type: String, required: true, validate: /^.{1,512}$/ },
    integrationId: ObjectId,
    deleted: { type: Boolean, default: false },
    edits: { type: [{ content: { type: String, required: true }, date: { type: Date, default: new Date() } }], default: [] },
    views: { type: [ObjectId], default: [] },
    date: { type: Date, default: Date.now }
});

messageSchema.post("updateMany", async function (doc, next) {
    if (doc.modifiedCount >= 1) {
        var messages = await Message.getMessagesByIds(this.getQuery()._id.$in);
        (await io.to("integrationid:" + messages[0].integrationId?.toString()).fetchSockets()).forEach(socket => {
            socket.emit("messages.view", messages.map(a => ({ id: a._id, views: a.views.length, isViewed: a.views.includes(socket.profileId) })));
        });
    }
    next();
});
messageSchema.pre("save", function (next) {
    if (!this.isNew && this.isModified("deleted") && this.deleted == true) {
        io.to("integrationid:" + this.integrationId?.toString()).emit("message.delete", this._id);
    }
    next();
});
messageSchema.post("validate", async (doc, next) => {
    if (doc.isNew) {
        await doc.populate({ path: "author", select: "username" });
        io.to("integrationid:" + doc.integrationId?.toString()).emit("message.send", { _id: doc._id, author: doc.author, content: doc.content, date: doc.date, views: 0, isViewed: false });
    }
    next();
});

const messageModel = model("Message", messageSchema, "messages");

class Message {
    /**
     * 
     * @param {ObjectId} profileId 
     * @param {String} content 
     */
    static create(profileId, content, integrationId) {
        return new messageModel({ author: profileId, content, integrationId }).save();
    }

    /**
     * 
     * @param {ObjectId} id 
     */
    static getById(id) {
        return messageModel.findById(id, {}, { populate: { path: "author", select: "username" } }).where("deleted", false);
    }

    /**
     * 
     * @param {*} profile 
     * @param {Number} from 
     * @param {Number} number 
     */
    static async getMessages(profile, integrationId, from, number) {
        if (!from || isNaN(from) || from < 0) throw new Error("La valeur de départ doit être supérieure à 0.");
        if (number > 50) throw new Error("Le nombre de message ne peut pas excéder 50.");
        return Message.getMessagesFields(profile, await messageModel.find({ integrationId }, {}, { populate: { path: "author", select: "username" } }).sort({ date: -1 }).where("deleted", false).skip(from).limit(number));
    }

    /**
     * 
     * @param {ObjectId[]} ids 
     */
    static getMessagesByIds(ids) {
        return messageModel.find({ _id: { $in: ids } }, {}, { populate: { path: "author", select: "username" } });
    }

    static getMessagesFields(profile, docs) {
        return docs.map(a => Message.getMessageFields(profile, a));
    }

    static getMessageFields(profile, doc) {
        return { _id: doc._id, author: doc.author, content: doc.content, date: doc.date, views: doc.views.length, isViewed: (doc.views.includes(profile._id) || doc.date.getTime() < profile.date.getTime()) };
    }

    static getUnreadCount(profile) {
        return messageModel.find({ views: { $not: { $all: [profile._id] } }, date: { $gt: profile.date }, integrationId: profile.integrationId, deleted: false }).count();
    }

    static getUnread(profile) {
        return messageModel.find({ views: { $not: { $all: [profile._id] } }, date: { $gt: profile.date }, integrationId: profile.integrationId, deleted: false });
    }

    static getMemberMessagesCount(id) {
        return messageModel.count({ author: id, deleted: false });
    }

    /**
     * 
     * @param {ObjectId[]} ids
     * @param {ObjectId} id
     */
    static addViewToMessages(ids, id) {
        return messageModel.updateMany({ _id: { $in: ids } }, { $addToSet: { views: id } });
    }
}

module.exports = { Message };