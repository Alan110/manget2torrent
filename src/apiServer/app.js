var express = require('express');
var app = express();
let router = require('./router')

app.use('/', router);

app.listen(3100, function () {
    console.log('Example app listening on port 3100!');
});