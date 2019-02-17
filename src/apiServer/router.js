let express = require('express')
var router = express.Router();
let MagnetSchema = require('../mongodb/index')


// define the home page route
router.get('/', function (req, res) {
    res.send('Birds home page');
});
// define the about route
router.get('/about', function (req, res) {
    res.send('About birds');
});

// define the about route
router.get('/search', async function (req, res) {
    let { name, filed } = req.query
    console.log(name)
    let returnFileds = filed ? filed.split(',').reduce((obj, el) => {
        obj[el] = 1
        return obj
    }, {}) : {}
    console.log(returnFileds)
    let fileList = await MagnetSchema.find({ name: new RegExp(name) }, returnFileds).limit(10)
    res.send(fileList);
});

module.exports = router;