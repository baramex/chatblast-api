const { Profile } = require("./models/profile.model");
const { Session, Middleware } = require("./models/session.model");
const cookie = require("cookie");
const { io } = require("./server");

let typing = [];
let disconnected = [];

io.on("connection", async (socket) => {
    Middleware.checkValidAuth(cookie.parse(socket.handshake.headers.cookie), socket.handshake.headers.referer).then(result => {
        socket.profileId = result.session.profileId;
        socket.integrationId = result.integration?._id;

        socket.join(["authenticated", "profileid:" + result.session.profileId.toString(), "integrationid:" + result.integration?._id.toString()]);

        const d = disconnected.findIndex(a => a.id.equals(result.profile._id) && (a.integrationId || result.integration) ? a.integrationId?.equals(result.integration?._id) : true);
        if (d != -1) disconnected.splice(d, 1);
        else if (!Array.from(io.sockets.sockets.values()).filter(a => a.id !== socket.id).find(a => a.profileId?.equals(result.profile._id) && ((a.integrationId || result.integration) ? a.integrationId?.equals(result.integration?._id) : true))) {
            Session.connectMessage(result.profile, result.integration?._id).catch(console.error);
        }

        socket.emit("connected");
    }).catch(e => {
        console.error(e);
        socket.disconnect(true)
    });

    socket.on("disconnecting", async () => {
        const rooms = socket.rooms;
        const profileId = socket.profileId;
        if (!profileId || !rooms.has("authenticated")) return;

        const i = disconnected.findIndex(a => a.id.equals(profileId));
        if (i === -1) disconnected.push({ id: profileId, intid: socket.integrationId, date: new Date().getTime() });
        else disconnected[i].date = new Date().getTime();

        const profile = await Profile.getProfileById(profileId);
        if (!profile) disconnected = disconnected.filter(a => !a.id.equals(profileId));
    });
});

// disconnect
setInterval(() => {
    disconnected.filter(a => a.date <= new Date().getTime() - 1000 * 10).forEach(async ({ id, intid }) => {
        if (Array.from(io.sockets.sockets.values()).find(a => a.profileId?.equals(id) && ((a.integrationId || intid) ? a.integrationId?.equals(intid) : true))) return;
        const i = typing.findIndex(a => a.id.equals(id));
        if (i != -1) typing.splice(i, 1);
        await Session.disconnectMessage(await Profile.getProfileById(id).catch(console.error), intid).catch(console.error);
    });
    disconnected = disconnected.filter(a => a.date > new Date().getTime() - 1000 * 10);
}, 1000 * 10);

function addTyping(profile, integrationId) {
    if (!typing.some(a => a.id.equals(profile._id))) {
        typing.push({ id: profile._id, username: profile.username, integrationId });
        io.to("integrationid:" + integrationId?.toString()).emit("message.typing", { isTyping: true, id: profile._id, username: profile.username });
    }
}

function removeTyping(profile, integrationId) {
    const i = typing.findIndex(a => a.id.equals(profile._id));
    if (i != -1) {
        typing.splice(i, 1);
        io.to("integrationid:" + integrationId?.toString()).emit("message.typing", { isTyping: false, id: profile._id, username: profile.username });
    }
}

module.exports = { typing, disconnected, addTyping, removeTyping };