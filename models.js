var mongoose = require('mongoose');
var findOrCreate = require('mongoose-findorcreate');


var userSchema = mongoose.Schema({
	"name" : { type: String },
	"id" : { type: String },
	"access_token" : { type: String },
	'access_type' : {type: String}
});

userSchema.plugin(findOrCreate);

exports.User = mongoose.model('User', userSchema);

