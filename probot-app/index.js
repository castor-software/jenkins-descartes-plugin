var mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1/commits');

// Register the mongoose model
const Stats = require('./StatSchema')
var timeslide_db = require('./timeslide_model');

var sort = require('fast-sort');

var percentage = require('percentage-calc');
var round = require( 'math-round' );

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
 // we're connected!
    console.log('db connected...')
});

var jenkins_project_name = 'test' //'test_development'  // test

// SAVE for re-authentication
var my_context
var jsonfile

module.exports = app => {

    app.log('Yay, the app was loaded!')

// Github sends PAYLOAD
    app.on('push', async context => {

        var jenkins = require('jenkins')({ baseUrl: 'http://admin:admin@130.237.59.170:8080', crumbIssuer: true })

       console.log("------------------------------------------------------------------------------")
       console.log(context.payload.repository.full_name)
       console.log("------------------------------------------------------------------------------")

       if (context.payload.repository.full_name === "INRIA/spoon")
       {
           jenkins.job.build({name: jenkins_project_name, parameters: { commitid: context.payload.head_commit.id } }, function(err) {
               if (err) throw err;
           });
           console.log("--------------------INRIA/spoon repo triggered jenkins job..................................")

           app.log('push event fired')
           app.log(context.payload)
       }
       else
       {
           console.log("-------------------- Beware! -> this is not a commit from spoon repo - Jenkins Aborted!......")
       }

        my_context = context
    })

  const router = app.route('/')
        router.use(require('express').static('public'))

    var bodyParser = require('body-parser')

    // create application/json parser
    var jsonParser = bodyParser.json()

    const asyncHandler = require('express-async-handler')


    router.post('/app', jsonParser, asyncHandler(async (req, res, next) => {

    // getting expired credential
    //the token used in `context.github` expires after 59 minutes and Probot caches it.
    //Since you have `context.payload.installation.id`, you can reauthenticate the client with:

    const log = app.log
    const my_github = await app.auth(my_context.payload.installation.id,log) // re-authenticate...

        var jsonQ = require('jsonq')
        var glob = require('glob')

        // files is an array of filenames.  .... can get this file some better way..
        // *** TODO *** the filepath should be dynamic in the future...
    //  glob("../../../../../var/lib/jenkins/workspace/test-dhell/target/pit-reports/*/methods.json", function (err, files) {
        glob("../../../../../var/lib/jenkins/workspace/" + jenkins_project_name +"/target/pit-reports/*/methods.json", function (err, files) {

            if (err) {
                console.log(err)
            } else {

                // a list of paths to javaScript files in the current working directory
                // TODO - fixa jsonfile LOKALT!!!
                jsonfile = files.slice(-1).pop()

                console.log(jsonfile)

                // TODO -skriva metoder som.. läser från fil.
                const fs = require('fs')

                let rawdata = fs.readFileSync(jsonfile)
                let methodsjson = JSON.parse(rawdata)

                var allmethods = methodsjson.methods

                var temp = []
                // loop all methods..
                for(var i = 0; i < allmethods.length; i++)
                {
                    var obj = allmethods[i];
                    temp.push(obj.package)
                }

                var uniqueItems = Array.from(new Set(temp))

                var array_all = []

                for(var i = 0; i < uniqueItems.length; i++)
                {
                    var obj = uniqueItems[i];

                    var jsonObj_child = {
                        "name": obj,
                        "tested": 0,
                        "notcovered": 0,
                        "partiallytested": 0,
                        "pseudotested": 0,
                        "partiallytested_links": [],
                        "pseudotested_links": []
                    };

                    array_all.push(jsonObj_child)
                }


                for(var i = 0; i < allmethods.length; i++)
                {
                    var obj = allmethods[i];

                    array_all.forEach(function(entry) {

                        if(obj.package === entry.name)
                        {
                            // lets count them ways..
                            if (obj.classification === 'tested' )
                            {
                                entry.tested = entry.tested + 1
                            }
                            if (obj.classification === 'partially-tested' )
                            {
                               entry.partiallytested = entry.partiallytested + 1

                               // add link to some..
                               var linkstring = "link " + entry.partiallytested

                             //  var link = "https://github.com/martinch-kth/commons-codec/tree/trunk/src/main/java/"+ obj.package +"/"+ obj['file-name'] +"#L"+ obj['line-number']

                               var branchName = String(my_context.payload.ref).split('/').pop();

                               var link = "https://github.com/"+ my_context.payload.repository.full_name +"/blob/" + branchName +"/src/main/java/"+ obj.package +"/"+ obj['file-name'] +"#L"+ obj['line-number']

                               var myObj = {[linkstring]: link};

                               var myObj_tests = {["tests"]: obj['tests']};

                               entry.partiallytested_links.push(myObj);
                               entry.partiallytested_links.push(myObj_tests);
                            }

                            if (obj.classification === 'pseudo-tested')
                            {
                               entry.pseudotested = entry.pseudotested + 1

                               var linkstring = "link " + entry.pseudotested

                               var branchName = String(my_context.payload.ref).split('/').pop();

                               var link = "https://github.com/"+ my_context.payload.repository.full_name +"/blob/" + branchName +"/src/main/java/"+ obj.package +"/"+ obj['file-name'] +"#L"+ obj['line-number']

                               var myObj = {[linkstring]: link};
                               var myObj_tests = {["tests"]: obj['tests']};
                               entry.pseudotested_links.push(myObj);
                               entry.pseudotested_links.push(myObj_tests);
                            }
                            if (obj.classification === 'not-covered' )
                            {
                                entry.notcovered = entry.notcovered + 1
                            }
                        }
                    });
                }


                // count count count..

                var methods_total = allmethods.length
                var tested_total = 0
                var partially_tested_total = 0
                var pseudo_tested_total = 0
                var non_covered_total = 0

                array_all.forEach(function(i, idx, array){

                 tested_total += i.tested
                 partially_tested_total += i.partiallytested
                 pseudo_tested_total += i.pseudotested
                 non_covered_total += i.notcovered
                });

                var packages_partially_tested = '{'
                var packages_pseudo_tested = '{'

                var treemap='{"name":"Mutation test","color":"hsl(187, 70%, 50%)","children":['
                var treemap_percent ='{"name":"Mutation test","color":"hsl(187, 70%, 50%)","children":['

                var result= '{'

                array_all.forEach(function(i, idx, array){

                    var result_package = '"package ' + String(idx)+ '": "' + String(i.name) + '  Tested: ' + String(i.tested) + '  Partially tested: ' + String(i.partiallytested) + '  Not covered: ' + String(i.notcovered) + '"'

                    var result_partially_tested = '"'+ String(i.name) +'" : ' + JSON.stringify(i.partiallytested_links)
                    var result_pseudo_tested = '"'+ String(i.name) +'" : ' + JSON.stringify(i.pseudotested_links)

                    var pacpac='{"name":"' + String(i.name) +'","color":"hsl(87, 70%, 50%)","children":[' +

                        '{"name": "Tested",' +
                        '"color":"hsl(99, 98%, 51%)",' +
                        '"loc":' + i.tested +
                        '},{"name":"Partially tested",' +
                        '"color": "hsl(53, 100%, 50%)",' +
                        '"loc": ' + i.partiallytested +
                        '},{"name":"Pseudo tested",' +
                        '"color": "hsl(0, 0%, 50%)",' +
                        '"loc": ' + i.pseudotested +
                        '},{"name": "Not covered",' +
                        '"color": "hsl(348, 100%, 50%)",' +
                        '\"loc\": ' + i.notcovered

                    var total_percentage = i.tested + i.partiallytested + i.notcovered

                    var treemap_percent_child ='{"name":"'+ String(i.name) +'","color":"hsl(87, 70%, 50%)","children":[' +

                        '{"name": "Tested",' +
                        '"color":"hsl(299, 70%, 50%)",' +
                        '"loc":' + round(percentage.from(i.tested, total_percentage))+
                        '},{"name":"Partially tested",' +
                        '"color": "hsl(143, 70%, 50%)",' +
                        '"loc": ' + round(percentage.from(i.partiallytested, total_percentage)) +
                        '},{"name": "Not covered",' +
                        '"color": "hsl(12, 70%, 50%)",' +
                        '\"loc\": ' + round(percentage.from(i.notcovered, total_percentage))

                    var tail= '}]},'
                    var last_tail= '}]}'

                    var result_tail= ','

                    if (idx === array.length - 1){
                        console.log("Last callback call at index " + idx + " with value " + i );
                        treemap = treemap + pacpac + last_tail
                        treemap_percent = treemap_percent + treemap_percent_child + last_tail

                        result = result + result_package

                        packages_partially_tested = packages_partially_tested + result_partially_tested
                        packages_pseudo_tested = packages_pseudo_tested + result_pseudo_tested

                    }
                    else
                    {
                        treemap = treemap + pacpac + tail
                        treemap_percent = treemap_percent + treemap_percent_child + tail

                        result = result + result_package + result_tail

                        packages_partially_tested = packages_partially_tested + result_partially_tested + result_tail
                        packages_pseudo_tested = packages_pseudo_tested + result_pseudo_tested + result_tail
                    }
                });


                var close_tree = ']}'
		var close_result = '}'

		treemap = treemap + close_tree
        treemap_percent = treemap_percent + close_tree
		result = result + close_result

        packages_partially_tested = packages_partially_tested + close_result
        packages_pseudo_tested = packages_pseudo_tested + close_result

           ///// JUST CHECKING ////////////////////////////////////////
           var isJSON = require('is-valid-json');

           // "obj" can be {},{"foo":"bar"},2,"2",true,false,null,undefined, etc.
           // var obj = "any JS literal here";

           if( isJSON(treemap_percent) ){

           // Valid JSON, do something
          console.log(treemap_percent)
          }
          else{

          // not a valid JSON, show friendly error message
          console.log("not valid JSON")
         // console.log(result)
          }

                // jenkins parsing
                console.log(req.body)

                var jenkinsobj = jsonQ(req.body)

                var jenkins_status = jenkinsobj.find('build').find('status').firstElm().toLowerCase();

                var jenkins_all = jenkinsobj.find('build').find('url').firstElm()
                var jenkins_info = jenkins_all.replace(/\//g, "_")

                // replace / with _
                console.log('jenk_:'+ jenkins_info)
                console.log('jenk_status:'+ jenkins_status)

                // New ..sorting..hope..it ..workz..
                var treemap_sorted_by_partiallytested = JSON.stringify(sort(JSON.parse(treemap).children).desc(p => p.children[1].loc))

                var treemap_partial  ='{"name":"Mutation test","color":"hsl(187, 70%, 50%)","children":'

                var close_result_partial = '}'

                var stat = new Stats({ commit_id: my_context.payload.head_commit.id,
                                       date: my_context.payload.head_commit.timestamp,
                                       username: my_context.payload.head_commit.author.username,
                                       repository:my_context.payload.repository.name,
                                       packages_partially_tested: packages_partially_tested ,
                                       packages_pseudo_tested: packages_pseudo_tested ,
                                       commit_url: my_context.payload.head_commit.url ,
                                       treemap : treemap,
                                       treemap_percent : treemap_percent,

                                       treemap_partiallytested_sorted : treemap_partial + treemap_sorted_by_partiallytested + close_result_partial,

                                       methods_total: methods_total ,
                                       tested_total: tested_total,
                                       partially_tested_total: partially_tested_total ,
                                       pseudo_tested_total : pseudo_tested_total,

                                       non_covered_total: non_covered_total });

                stat.save(function (err, somestat) {
                  if (err) return console.error(err);
                });

            const commitstatus = my_context.repo({

                  state : jenkins_status,
                  target_url : 'http://130.237.59.170:3001/' + my_context.payload.head_commit.id ,
                  description : jenkins_info,
                  context : "continuous-integration/jenkins",
                  sha: my_context.payload.head_commit.id,
                  message : my_context.payload.head_commit.message

                })

                res.send(my_github.repos.createStatus(commitstatus))


                // HÄR KOMMER TIMESLIDE code...
                //----------------------------------------

                var payload_timestamp = my_context.payload.head_commit.timestamp

                var timeslide_entry = class timeslide_entry {
                    constructor(method_name, package_name, classification, timestamp_from, timestamp_to) {
                        this.method_name = method_name;
                        this.package_name = package_name;
                        this.classification = classification;
                        this.timestamp_from = timestamp_from;
                        this.timestamp_to = timestamp_to;
                    }

                    returnEntry() {
                        // clean code! ;-)
                        return {"group": this.method_name,
                            data : [ {"label": this.package_name,
                                data : [{ timeRange: [this.timestamp_from, this.timestamp_to],
                                    "val" : this.classification }]}]};
                    }
                }

                // takes the methods.js file and converts it to an array with timeslide objects
                function createTimeslideData(jsonfile , payload_timestamp) {    // tex.. 2019-08-29T09:55:09.856Z

                    var all_timeslide_entries = []
                    const fs = require('fs')

                    let rawdata = fs.readFileSync(jsonfile)
                    let methodsjson = JSON.parse(rawdata)

                    var allmethods = methodsjson.methods

                    var FROM_fake_payload_date = new Date(payload_timestamp);

                    // faking the TO date, since we don't know when the next commit will be. The TO date will be changed on the next commit.
                    var TO_fake_payload_date = new Date(payload_timestamp);
                    TO_fake_payload_date.setHours(FROM_fake_payload_date.getHours() + 1); // faking it with +1 hour..in todays date

//---------------------------------- make timeslide DATA from methods.js --------------------------
                    for (var i = 0; i < allmethods.length; i++)
                    {
                        var testmethod = allmethods[i];

                        if (testmethod.classification === 'pseudo-tested' || 'partially-tested')
                        {
                            let map = new Map();

                            for (var j = 0; j < testmethod['tests'].length; j++) {

                                var attrValue = testmethod['tests']
                                var lastPart_test = attrValue[j].split(".").pop().slice(0, -1);

                                // if map does not contain ...lastpart..
                                if (!map.has(lastPart_test))
                                    map.set(lastPart_test, 1);
                                else map.set(lastPart_test, (map.get(lastPart_test))+1);
                            }

                            var method_package_and_all_test = testmethod.package + "\n\n"

                            for (const [key, value] of map.entries()) {
                                method_package_and_all_test += key + " " + value + "\n"
                            }
                        }
                        else method_package_and_all_test = testmethod.package

                        // create unique KEY .. looks bad..bad way...!...... FIX later...
                        var entry = new timeslide_entry(testmethod.name + testmethod['line-number'], method_package_and_all_test, testmethod.classification, FROM_fake_payload_date, TO_fake_payload_date)
                        all_timeslide_entries.push(entry.returnEntry())
                    }
                    return all_timeslide_entries
                }

                function getTimeslide_DB_data(jsonfile, payload_timestamp) {

                    db.collection('timeslide').count(function(err, count) {
                        console.dir(err);
                        console.dir(count);

                        if( count == 0) {
                            console.log("No Found Records.");

                            var timeslide_file_DATA = createTimeslideData(jsonfile, payload_timestamp)

                            var timecapsule = new timeslide_db({

                                date: new Date(),
                                username: "MartinO",
                                timeslide_all : JSON.stringify(timeslide_file_DATA)
                            });

                            timecapsule.save(function (err, somestat) {
                                if (err) return console.error(err);
                            });
                        }
                        else {
                            console.log("Found Records : " + count);

                            timeslide_db.findOne(function (err, commits) {

                                if (err)
                                {
                                    console.log('The search errored');
                                }
                                else
                                {
                                    return successCallback(commits);
                                };
                            })

                        }
                    });
                }

                var successCallback = function(data) {
                    console.log("Success");

                    var timeslide_file_DATA = createTimeslideData(jsonfile, payload_timestamp)  // HÄR måste ja ändra för varje commit!...ååå suck !!

                    var timeslide_DB_DATA = JSON.parse(data.timeslide_all)  // Must be casted into Array object!

                    var merged_DATA = merge2one(timeslide_DB_DATA, timeslide_file_DATA, payload_timestamp)

                    console.log(JSON.stringify(merged_DATA,null, 2))  // kolla de blev... -1 sekund..  -> FUNKAR

                    update_timeslide_DB(merged_DATA)
                }

                function merge2one(from_DB, from_methods_file, timestamp)
                {
                    var to_date_edited = new Date(timestamp)

                     // SKIPPA ta bor 100 sek..slut datum kan va samma som nästa commits start datum....funkar IAF!?       to_date_edited.setSeconds(to_date_edited.getSeconds() - 100)  // 100 sekund..vet ej.. vad som händer om man kommitar en massa...låt bli 4 now..
                    // Du måste ändra i TO datum i det som redan finns i DB

                    for (var i = 0; i < from_DB.length; i++)
                    {
                        from_DB[i].data[0].data[0].timeRange[1] = to_date_edited // to string???
                    }

                    //  console.log(JSON.stringify(from_DB,null, 2))  // kolla de blev... -1 sekund..  -> testad redan - FUNKAR

                    // MERGE TIME..
                    for (var i = 0; i < from_methods_file.length; i++)
                    {
                        var methodname = from_methods_file[i].group

                        for (var j = 0; j < from_DB.length; j++)
                        {

                            if (from_DB[j].group === methodname)
                            {
                                from_methods_file[i].data[0].data = from_methods_file[i].data[0].data.concat(from_DB[j].data[0].data);
                            }
                        }
                    }
                    return from_methods_file;
                }

                function update_timeslide_DB(timeslide_DATA) {

                    var myquery = { username: "MartinO" };
                    var newvalues = { $set: {timeslide_all: JSON.stringify(timeslide_DATA) } };  // this is the field that will be updated...
                    timeslide_db.updateOne(myquery, newvalues, function(err, res) {
                        if (err) throw err;
                        console.log("1 document updated");
                    });
                }

                function create_patterns() {

                    var query = timeslide_db.find({ username: 'MartinO'}).lean().exec(function (err, docs) {

                        // docs are plain javascript objects instead of model instances
                        var timeslide_raw = JSON.parse(docs[0].timeslide_all)

                        var timeslide_all_partially_tested_in_last_commit = filterTests(timeslide_raw,'partially-tested')
                        var timeslide_all_pseudo_tested_in_last_commit    = filterTests(timeslide_raw,'pseudo-tested')

                        console.log( Object.getPrototypeOf(timeslide_raw))
                        console.log( timeslide_raw.length)

                        var timeslide_good_pattern = []
                        var timeslide_problem_green_to_yellow = []
                        var timeslide_problem_green_to_red = []

                        for (var i=0 ;i < timeslide_raw.length;i++)
                        {
                            // get latest/commit/value of all the commited methods.. like in timespan.. last element in the timespan and its VALUE
                            var last_value_in = timeslide_raw[i].data[0].data[0].val

                            for (var j = 0; j < timeslide_raw[i].data[0].data.length; j++) // stega igenom all timeRange+values i metoden..
                            {
                                var value = timeslide_raw[i].data[0].data[j].val              // få value... tested, non-covered osv..

                                if (last_value_in === 'tested' && value !== 'tested') {  // om sista commiten är 'tested' men det finns commits innan som inte gav tested så är det bra..
                                    timeslide_good_pattern.push(timeslide_raw[i])
                                }
                                else if (last_value_in === 'partially-tested' && value === 'tested' )
                                {
                                    timeslide_problem_green_to_yellow.push(timeslide_raw[i])
                                }
                                else if (last_value_in === 'pseudo-tested' && value === 'tested' )
                                {
                                    timeslide_problem_green_to_red.push(timeslide_raw[i])
                                }
                            }
                        }

                        var myquery = { username: "MartinO" };
                        var newvalues = { $set: {timeslide_good_pattern : JSON.stringify(timeslide_good_pattern) ,
                                timeslide_problem_green_to_yellow : JSON.stringify(timeslide_problem_green_to_yellow),
                                timeslide_problem_green_to_red : JSON.stringify(timeslide_problem_green_to_red),
                                timeslide_all_partially_tested_in_last_commit : JSON.stringify(timeslide_all_partially_tested_in_last_commit),
                                timeslide_all_pseudo_tested_in_last_commit : JSON.stringify(timeslide_all_pseudo_tested_in_last_commit)}
                        };
                        timeslide_db.updateOne(myquery, newvalues, function(err, res) {
                            if (err) throw err;
                            console.log("1 document updated...");
                        });

                    });
                }

                function filterTests(unfiltered_data , filter_type)
                {
                    var filtered = []

                    for (var i = 0; i < unfiltered_data.length; i++)
                    {
                        var classification = unfiltered_data[i].data[0].data[0].val

                        if (classification === filter_type)
                        {
                            var wanted_data = unfiltered_data[i]
                            wanted_data.data[0].data.length = 1
                            filtered.push( wanted_data)
                        }
                    }
                    return filtered
                }

                //---------------Timeslide------------------------
              var timeslide_DB_DATA = getTimeslide_DB_data(jsonfile, payload_timestamp)

              // create the new filters...
              create_patterns()
           }
        })
    })
   )
}

