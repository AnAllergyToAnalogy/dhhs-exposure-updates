const url = 'https://www.dhhs.vic.gov.au/case-locations-and-outbreaks';

console.clear();
console.log('\n\n\n\n\n');


const https = require('https');
const fs = require("fs-extra");
var crypto = require('crypto');

var html2json = require('html2json').html2json;
var json2html = require('html2json').json2html;

let wholeBody;

let nnth = 0;
let reconnecting = false;

const resetText ="\x1b[0m";
const greenText =  "\x1b[32m"+"\x1b[1m";
const yellowText = "\x1b[33m"+"\x1b[1m";
const redText =    "\x1b[31m"+"\x1b[1m";
const blueText =   "\x1b[36m"+"\x1b[1m";
let indent0 = '\t\t';
let indent = '\t\t|\t';
console.log(indent0,'===========================================');
console.log(indent0,'===  DHHS COVID Exposure site updates  ====');
console.log(indent0,'===========================================');
console.log('');

let updates = [];
let all_locations = {
    high: {},
    medium: {},
    low: {}
};


function decodeEntities(encodedString) {
    var translate_re = /&(nbsp|amp|quot|lt|gt);/g;
    var translate = {
        "nbsp":" ",
        "amp" : "&",
        "quot": "\"",
        "lt"  : "<",
        "gt"  : ">"
    };
    return encodedString.replace(translate_re, function(match, entity) {
        return translate[entity];
    }).replace(/&#(\d+);/gi, function(match, numStr) {
        var num = parseInt(numStr, 10);
        return String.fromCharCode(num);
    });
}
function isMatch(targetObj,tag,attributes){
    if(!targetObj){
        return false;
    }

    if(targetObj.node === "element" && targetObj.tag && targetObj.tag === tag) {
        let all_attributes_match = true;
        for (let attr in attributes) {
            if (!targetObj.attr) {
                all_attributes_match = false;
                break;
            } else {
                if (typeof targetObj.attr[attr] !== "undefined" &&
                    (
                        (targetObj.attr[attr] === attributes[attr])
                        ||
                        (typeof targetObj.attr[attr].includes === "function"
                            &&
                            targetObj.attr[attr].includes(attributes[attr]))
                    )
                ) {
                    // continue;
                }else{
                    all_attributes_match = false;
                    break;
                }
            }
        }

        if (all_attributes_match) {
            nnth++;
            return true;
        }
    }else{
        return false;
    }
}
function searchTree(tag,attributes,nth){
    nnth = 0;
    let result = doSearchObj(wholeBody,tag,attributes,nth);
    if(result){
        return result;
    }else{
        console.log('Fatal read error: not found in tree');
        process.exit();
    }
}
function doSearchObj(obj,tag,attributes,nth){
    if(!nth) nth = 1;
    if(obj.node !== "root" && isMatch(obj,tag,attributes) && nnth === nth){
        return obj;
    }else{
        if(obj.child && obj.child.length > 0){
            for(let c in obj.child){
                let child = obj.child[c];

                let match = doSearchObj(child,tag,attributes,nth);
                if(match){
                    return match;
                }
            }
        }
        return false;
    }
}
function searchObj(obj,tag,attributes,nth){
    nnth = 0;
    return doSearchObj(obj,tag,attributes,nth);
}
function parse_row(rowObj){
    let location = '';
    let location_obj = rowObj.child[3].child[2];
    if(location_obj){
        location = decodeEntities(location_obj.text);
    }

    let time = '';
    let time_obj = rowObj.child[5];
    if(time_obj){
        if(time_obj.child.length === 1){
            time = decodeEntities(time_obj.child[0].text);
        }else if(time_obj.child.length > 1){
            time = [];
            for(let t = 1; t < time_obj.child.length; t += 2){
                if(time_obj.child[t].child){//Todo: ??? this line okay?
                    time.push(decodeEntities(time_obj.child[t].child[0].text));
                }
            }
        }
    }

    return {
        suburb:         decodeEntities(rowObj.child[1].child[0].text),
        location_name:  decodeEntities(rowObj.child[3].child[0].text),
        location_address: location,
        time: time,
        details: decodeEntities(rowObj.child[7].child[0].text),
    }
}
function locationKey(event){
    var md5sum = crypto.createHash('md5');
    md5sum.update(JSON.stringify(event));
    return md5sum.digest('hex');
}

function getLocalData(){
    console.log(indent0,"Get local data...");
    let rawData = '';
    try{
        rawData = fs.readFileSync("updateData.txt", 'utf8');
    }catch(e){
        console.log(e);
        console.log("Failed to read local data");
        process.exit();

    }

    console.log(indent0,"Parse data...");
    updates = JSON.parse(rawData);
    for(let u = 0; u < updates.length; u++){
        for( let l = 0; l < updates[u].low.length; l++){
            all_locations.low[locationKey(updates[u].low[l])] = updates[u].low[l];
        }
        for( let m = 0; m < updates[u].medium.length; m++){
            all_locations.medium[locationKey(updates[u].medium[m])] = updates[u].medium[m];
        }
        for( let h = 0; h < updates[u].high.length; h++){
            all_locations.high[locationKey(updates[u].high[h])] = updates[u].high[h];
        }
    }

}
function writeLocalData(){
    try{
        fs.writeFileSync("updateData.txt",JSON.stringify(updates));
    }catch (e){
        console.log("Error saving local data");
        console.log(e);
    }
}

function parseServerData(data){
    wholeBody = html2json(data);

    let article = searchTree("article",{about:"/case-locations-and-outbreaks"});
    let first_table = searchObj(article,"table",null,1);
    let second_table = searchObj(article,"table",null,2);
    let third_table = searchObj(article,"table",null,3);

    let received_data = {
        high: parseTable(first_table),
        medium: parseTable(second_table),
        low: parseTable(third_table),
    }

    let update = {
        high: [],
        medium: [],
        low: [],
    }

    for(let h in received_data.high){
        if(!all_locations.high[h]){
            all_locations.high[h] = received_data.high[h];
            update.high.push(received_data.high[h]);
        }
    }
    for(let m in received_data.medium){
        if(!all_locations.medium[m]){
            all_locations.medium[m] = received_data.medium[m];
            update.medium.push(received_data.medium[m]);
        }
    }
    for(let l in received_data.low){
        if(!all_locations.low[l]){
            all_locations.low[l] = received_data.low[l];
            update.low.push(received_data.low[l]);
        }
    }


    if(logUpdate(update)){
        updates.push(update);
        writeLocalData();
    }



}

function parseTable(table){
    let data = {};
    let tbody = searchObj(table,"tbody",null);
    for(let r = 0; r < tbody.child.length; r++) {
        let child = tbody.child[r];
        if (child.tag === "tr") {


            let parsed = parse_row(child);
            // log_row(parsed);
            data[locationKey(parsed)] = parsed;
        }
    }
    return data;
}

function logUpdate(update){

    if(update.high.length === 0 && update.medium.length === 0 && update.low.length === 0) return false;
    console.log(resetText,indent0,"============     UPDATES     ============");
    console.log(resetText);

    if(update.high.length > 0){
        console.log('');
        console.log(redText,"Get tested immediately and quarantine for 14 days:");
        for(let i = 0; i < update.high.length; i++){
            console.log('');
            logLocation(update.high[i]);
        }
    }
    if(update.medium.length > 0){
        console.log('');
        console.log(yellowText,"Get tested immediately and quarantine until you receive a negative result:");
        for(let i = 0; i < update.medium.length; i++){
            console.log('');
            logLocation(update.medium[i]);
        }
    }
    if(update.low.length > 0){
        console.log('');
        console.log(blueText,"Monitor for symptoms - If symptoms develop, immediately get tested and isolate:");
        for(let i = 0; i < update.low.length; i++){
            console.log('');
            logLocation(update.low[i]);
        }
    }

    console.log(resetText);
    return true;
}

function logLocation(location){
    let indent0 = '\t\t';
    let indent = '\t\t|\t';

    console.log(indent0,location.suburb);
    console.log(indent,location.location_name);
    console.log(indent,location.location_address.trim());
    if(typeof location.time === "string"){
        console.log(indent,'\t',location.time);
    }else{
        for(let t in location.time){
            console.log(indent,'\t',location.time[t]);
        }
    }
    console.log(indent,location.details);
}

function checkForUpdates(){

    https.get(url, (resp) => {
        let data = '';

        resp.on('data', (chunk) => {
            if(reconnecting){
                reconnecting = false;
                console.log(indent0,'reconnected.')
            }
            data += chunk;
        });

        resp.on('end', () => {
            parseServerData(data);

            setTimeout(checkForUpdates,5*60*1000);
        });

    }).on("error", (err) => {
        console.log('');
        console.log(indent0+"Connection error: " + err.message);
        console.log('');
        setTimeout(()=>{
            console.log(indent0,'retrying...');
            reconnecting = true;
            checkForUpdates();
        },10000);
    });

}

getLocalData();
console.log(indent0,"Waiting for updates....");
console.log('');
checkForUpdates();