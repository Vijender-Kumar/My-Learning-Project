var axios = require('axios');
var moment = require('moment');

const postConfig = {
  method: "post",
  headers: {
    "apikey": process.env.SMS_MICROSERVICE_APIKEY,
    "Content-Type": "application/json"
  }
};

/**
 * convert a date of birth to a current age
 * @param yyyymmdd
 */
const dobToAge = function(yyyymmdd) {
  //use moment to conver to a good date
  var age = 0;
  if (typeof yyyymmdd != "string") {
    let dob = yyyymmdd.toString();
    age = moment().diff(dob, "years", false);
  } else {
    let dob = yyyymmdd;
    age = moment().diff(dob, "years", false);
  }
  console.log('dobToAge: started with dob', yyyymmdd, ' ended with ', age);
  return age;
}

/**
 * return YYYY-MM-DD of the upcoming day in the next month
 * upcoming(5) when run on april 30, returns may 5 in YYYY-MM-DD format
 * @param day
 * @param months by default 1 indicating the next immediate month
 * @returns YYYY-MM-DD
 */
const upcoming = function(day, months) {
  months = months ? parseInt(months, 10) : 1;
  var result = moment().add(months, 'M').startOf('month').add(day - 1, 'day').format("YYYY-MM-DD");
  console.log('upcoming: ', day, ' returns ', result);
  return result;
};

const upfrontDailyInterest = function(loanrequest, borrowerinfo) {
  var {
    loan_app_date,
    emi_day,
    sanction_amount,
    interest_rate
  } = borrowerinfo;
  var days = dateDiff(loan_app_date, upcoming(emi_day));
  var result = ((days / 365) * interest_rate * sanction_amount).toFixed(2);
  console.log('upfrontdailyinterest (', loan_app_date, emi_day, sanction_amount, interest_rate, ' gave result ', result);
  return result;
};

/**
 * eg: between 1st and 10th of the same month will return 9
 * @param from YYYY-MM-DD
 * @param to YYYY-MM-DD
 * @param {*} period
 * @returns # of period
 */
const dateDiff = function(from, to, period) {
  period = period ? period : 'days';
  var startDate = moment(from);
  var endDate = moment(to);
  var result = endDate.diff(startDate, period);
  console.log('dateDiff: ', from, ' to ', to, ' returns ', result);
  return result;
};

const pincodeToState = function(pincode) {
  return new Promise(function(resolve, reject) {
    var input = {
      pincode
    };
    axios.post("https://geo-utils-microservice.onrender.com/api/pincode/state", JSON.stringify(input), postConfig)
      .then(function(resp) {
        resolve(resp.data.data.state);
      })
      .catch(function(err) {
        console.log('cant find state from ', pincode)
        resolve(pincode);
      });
  });
};

const pincodeToCity = function(pincode) {
  return new Promise(function(resolve, reject) {
    var input = {
      pincode
    };
    axios.post("https://geo-utils-microservice.onrender.com/api/pincode/city", JSON.stringify(input), postConfig)
      .then(function(resp) {
        resolve(resp.data.data.city);
      })
      .catch(function(err) {
        console.log('cant find city from ', pincode)
        resolve(pincode);
      });
  });
};

/**
 * TODO
 * @param principal
 * @param months
 * @param air
 * @returns the monthly emi
 */
const monthlyEmi = function(principal, months, interest) {
  return new Promise(function(resolve, reject) {
    var input = {
      "principal": principal,
      "period": months,
      "interest": interest
    };
    axios.post("https://lmsutils-api.onrender.com/api/emi/monthlyemi", input, postConfig)
      .then(function(resp) {
        console.log('monthlyEmi input \n', JSON.stringify(input, null, 2), ' gave:\n', JSON.stringify(resp.data, null, 2));
        resolve(resp.data.data);
      })
      .catch(function(err) {
        console.log('cant find emi from theses argument', {
          "principal": principal,
          "period": months,
          "interest": interest
        });
        reject(err);
      });
  });
}


const calculateDisbursal = (loanrequest, borrowerinfo) => {
  return new Promise(function(resolve, reject) {
    var input = {
      loanrequest: loanrequest,
      borrowerinfo: borrowerinfo
    };
    axios.post("https://lmsutils-api.onrender.com/api/calculatedisbursal", input, postConfig)
      .then(function(resp) {
        console.log('calculateDisbursal input \n', JSON.stringify(input, null, 2), ' gave:\n', JSON.stringify(resp.data, null, 2));
        resolve(resp.data.data);
      })
      .catch(function(err) {
        reject();
      });
  });
}

const calculateDues = function(body) {
  return new Promise(function(resolve, reject) {
    axios.post("https://lmsutils-api.onrender.com/api/emi/dues", body, postConfig)
      .then(function(resp) {
        console.log('calculateDues got back:', resp.data.data);
        resolve(resp.data.data);
      })
      .catch(function(err) {
        console.log('cant find dues from theses argument', body);
        reject(err);
      });
  });
}

const int = function(x) {
  return parseInt(x, 10);
};

const float = function(x) {
  return parseFloat(x, 10);
};

module.exports = {
  int,
  float,
  pincodeToState,
  pincodeToCity,
  dobToAge,
  monthlyEmi,
  calculateDisbursal,
  upcoming,
  dateDiff,
  upfrontDailyInterest,
  calculateDues,
}