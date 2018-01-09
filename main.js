// Create database for things.
var path = require('path');
var Datastore = require('nedb');
var db = new Datastore({filename: path.join(process.cwd(), 'data.db'), autoload: true});

// Set variables and load modules
var cryptom = require('crypto');
var net = require('net');
var JsonSocket = require('json-socket');
var socket = new JsonSocket(new net.Socket());
var nacl = require('./src/js/nacl.js');
var BigNumber = require('bignumber.js');
var bigInt = require("big-integer");
var balance;
var myaddress;

// Get BrowserWindow.
const {remote} = require('electron');
const {BrowserWindow} = remote;


var RaiWallet  = require('./src/js/Wallet');
var Block = require('./src/js/Block');
wallet = new RaiWallet();

// Configure RaiLightServer:

var port = 7077;
var host = '127.0.0.1';

// Connect to RaiLightServer (yes, will be decentralized, later)
function start() {
	socket.connect(port, host);
}
start();

// If can't connect, try again (and again.. again..)
socket.on('error', function() {
	setTimeout(start, 1000);
});


// DATABASE AND WALLET LOAD
db.find({ type: 'wallet' }, function (err, docs) {
	if(docs && docs.length){
		myaddress = docs[0].address;
		checkChains();
		wallet = new RaiWallet("123");
		try{
			wallet.load(docs[0].pack);
			console.log("wallet loaded");
		}catch(e){
			console.log(e);
		}
		$(document).ready(function() {
			$( "#wallet1" ).removeClass('selected');
			$( "#wallet2" ).addClass('selected');
			$("#content").load( "pages/index.pg" );
		});
	} else {
		$(document).ready(function() {
			$("#wallet1").addClass('selected');
			$("#wallet2").removeClass('selected');
			$("#content").load("pages/create.pg");
		});
		
	}
});

// On RaiLightServer sucess connection:
socket.on('connect', function() {
	// Get first BlockCount ;)
    socket.sendMessage({requestType: "getBlocksCount"});

//	socket.sendMessage({requestType: "getBalance", address: "xrb_39ymww61tksoddjh1e43mprw5r8uu1318it9z3agm7e6f96kg4ndqg9tuds4"});
//	socket.sendMessage({requestType: "getInfo", address: "xrb_39ymww61tksoddjh1e43mprw5r8uu1318it9z3agm7e6f96kg4ndqg9tuds4"});
//  socket.sendMessage({requestType: "getPendingBlocks", addresses: ["xrb_1ce75trhhmqxxmpe3cny93eb3niacxwpx85nsxricrzg6zzbaz4j9zoss59n"]});

	// Handle RaiLightServer responses
    socket.on('message', function(r) {
	// If BlocksCount
		if (r.type == "BlocksCount") {
			// Update on frontend
			$("#block").html("Block: "+r.count);
		} else if (r.type == "PendingBlocks") {
			
			Object.keys(r.blocks).forEach(function(account){
				Object.keys(r.blocks[account]).forEach(function(hash){
					console.log( hash );
					console.log( account );
					console.log( r.blocks[account][hash].source);
					console.log( r.blocks[account][hash].amount);
					
					try {
						wallet.addPendingReceiveBlock(hash, account, r.blocks[account][hash].source, r.blocks[account][hash].amount);
						console.log("success");
					}
					catch(err) {
						console.log("erro "+err);
					}
					

				});
			});
			//socket.sendMessage({requestType: "getPendingBlocks", addresses: ["xrb_1ce75trhhmqxxmpe3cny93eb3niacxwpx85nsxricrzg6zzbaz4j9zoss59n"]});
		} else {
			// Debug, for now.
			console.log(r);
		}
    });
});

// EVENTS

// Close the app on button close click
$("#closebtn").click(function() {
	var window = BrowserWindow.getFocusedWindow();
	window.close();
});

// Minimise the app on button close click
$("#minbtn").click(function() {
	var window = BrowserWindow.getFocusedWindow();
	window.minimize();
});


$("#homebtn").click(function() {
	$( "#wallet1" ).removeClass('selected');
	$( "#wallet2" ).addClass('selected');
	$("#content").load( "pages/index.pg" );
	db.find({ type: 'wallet' }, function (err, docs) {
		wallet = new RaiWallet("123");
		try{
			wallet.load(docs[0].pack);
		}catch(e){
			console.log(e);
		}
	});
});

// FUNCTIONS

function encrypt(text, password){
	var cipher = cryptom.createCipher('aes-256-cbc',password);
	var crypted = cipher.update(text,'utf8','hex');
	crypted += cipher.final('hex');
	return crypted;
}

function decrypt(text, password){
	var decipher = cryptom.createDecipher('aes-256-cbc',password);
	var dec = decipher.update(text,'hex','utf8');
	dec += decipher.final('utf8');
	return dec;
}

// LOCAL POW

function clientPoW() {
	
	var pool = wallet.getWorkPool();

	var hash = false;
	if(pool.length > 0) {
		for(let i in pool) {
			if(pool[i].needed ||!pool[i].requested) {
				hash = pool[i].hash;
				break;
			}
		}
		if(hash === false) {
			return setTimeout(clientPoW, 1000);
		}
		pow_workers = pow_initiate(NaN, 'src/js/');
		pow_callback(pow_workers, hash, function() {
			console.log('Working locally on ' + hash);
		}, function(work) {
			console.log('PoW found for ' + hash + ": " + work);
			wallet.updateWorkPool(hash, work);
			setTimeout(clientPoW, 1000);
		});
	} else {
		setTimeout(clientPoW, 1000);
	}
}
setTimeout(clientPoW, 1000);

function checkReadyBlocks(){
	var blk = wallet.getNextReadyBlock();
	if(blk !== false)
		broadcastBlock(blk);
	setTimeout(checkReadyBlocks, 1500);
}

function broadcastBlock(blk){
	var json = blk.getJSONBlock();
	var hash = blk.getHash(true);
	console.log(hash);
	var guiHash;
	if(blk.getType() == 'open' || blk.getType() == 'receive')
		guiHash = blk.getSource();
	else
		guiHash = blk.getHash(true);
	
    socket.sendMessage({requestType: "processBlock", block: json});
    socket.on('message', function(r) {
		if (r.type == "processResponse") {
			wallet.removeReadyBlock(hash);
		}
	});
}

function checkChains() {
	var accs = wallet.getAccounts();
	var r = {};
	for (var i in accs) {
		if (accs[i].lastHash === false) r.push(accs[i].account);
	}
	console.log(myaddress);
	socket.sendMessage({requestType: "getChain", address: myaddress, count: "100"});
	//socket.sendMessage({requestType: "getChain", address: "xrb_1ce75trhhmqxxmpe3cny93eb3niacxwpx85nsxricrzg6zzbaz4j9zoss59n", count: "50"});
    socket.on('message', function(r) {
		if (r.type == "Chain") {
			console.log("chegou chain");
			var blocks = r.blocks;
			console.log(blocks);
			index = Object.keys(blocks);
			index.reverse();
			
			index.forEach(function(val, key){
				try{
					var blk = new Block();
					blk.buildFromJSON(blocks[val].contents);
					blk.setAccount(myaddress);
					blk.setAmount(blocks[val].amount);
					blk.setImmutable(true);
					wallet.importBlock(blk, myaddress, false);
					console.log("Hash "+val+" loaded")
				}catch(e){
					console.log(e);
				}

			});
			setTimeout(checkReadyBlocks, 1000);
			wallet.useAccount(myaddress);
			wallet.setAccountBalancePublic(balance, myaddress);
		}
	});
}

// Dev stupid things, for testing.		
$("#submit").submit(function(e) {
	e.preventDefault();
	var test = $("#test").val();
	socket.sendMessage({msg: test});
});