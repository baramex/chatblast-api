const { Schema, model } = require("mongoose");

const moduleSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, min: 0, required: true }
});

const ModuleModel = model("Module", moduleSchema, "modules");

class Module {
    static create(name, description, price) {
        return new ModuleModel({ name, description, price }).save();
    }

    static getById(id) {
        return ModuleModel.findById(id);
    }
}

module.exports = Module;