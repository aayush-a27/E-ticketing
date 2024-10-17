const { default: mongoose } = require("mongoose");
mongoose.connect(`mongodb://127.0.0.1:27017/userSignupDets`);
const userSchema = mongoose.Schema({
    username:{type: String, required: true},
    emailId:{type: String, required: true, unique: true},
    password:{type: String, required: true},
})
module.exports = mongoose.model('user', userSchema);