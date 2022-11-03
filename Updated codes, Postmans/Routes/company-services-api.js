bodyParser = require("body-parser");
const {
  check,
  validationResult
} = require("express-validator");
const CompanyServices = require("../models/company-services-schema.js");
const ServicesSchema = require("../models/services-schema.js");
const jwt = require("../util/jwt");
const s3helper = require("../util/s3helper.js");

module.exports = (app) => {
  app.use(bodyParser.json());
  app.get("/api/company_services", async (req, res) => {
    try {
      const companyServices = await CompanyServices.listAll();
      if (companyServices.length == 0) throw {
        message: "No services found for any company."
      };
      res.send(companyServices);
    } catch (error) {
      res.status(400).json({
        error
      });
    }
  });

  app.get("/api/company_services/:_company_id", async (req, res) => {
    try {
      const companyId = req.params._company_id;
      const findCompanyIdResp = await CompanyServices.findOneWithCompanyId(companyId);
      if (!findCompanyIdResp) throw {
        message: "Error while fetching services for selected company"
      };

      // if record is found but services are empty send an empty array
      if (findCompanyIdResp.services === "") throw {
        message: "No service found for this company"
      };

      // convert the comma separated values to an array and send
      var isMultipleservices = findCompanyIdResp.services.toString().indexOf(",") > -1;
      const serviceArr = isMultipleservices ? findCompanyIdResp.services.split(",") : [findCompanyIdResp.services];
      const serviceList = serviceArr.map((service) => {
        return parseInt(service);
      });
      res.send(serviceList);
    } catch (error) {
      res.status(400).json({
        error
      });
    }
  });

  app.post(
    "/api/company_services",
    [jwt.verifyToken, jwt.verifyCompany],
    [check("company_id").notEmpty().withMessage("Company ID is required"), check("services").notEmpty().withMessage("Services are required")],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) throw {
          message: errors.errors[0]["msg"]
        };
        const servicesData = req.body;
        // Prepare a msg to send at the end based on the incoming status
        const msg = servicesData.status === 0 ? "deactivated" : "activated";
        const findCompanyResp = await CompanyServices.findOneWithCompanyId(servicesData.company_id);
        // if (!findCompanyResp) throw { message: "Error while checking if service already exists for this company ." };
        if (findCompanyResp) {
          if (findCompanyResp.services) {
            var isMultipleservices = findCompanyResp.services.toString().indexOf(",") > -1;
            const serviceArr = isMultipleservices ? findCompanyResp.services.split(",") : [findCompanyResp.services];
            let serviceList = serviceArr.map((service) => {
              return parseInt(service);
            });
            if (servicesData.status === 0) {
              const index = serviceList.indexOf(servicesData.services);
              if (index > -1) {
                serviceList.splice(index, 1);
              }
            } else {
              serviceList.push(servicesData.services);
            }
            findCompanyResp.services = serviceList.toString();
            const updateResp = await CompanyServices.updateServices(findCompanyResp);
            if (!updateResp) throw {
              message: "Error while updating service."
            };
            res.send({
              message: `Service ${msg} for this company.`
            });
          } else {
            findCompanyResp.services = servicesData.services;
            const updateNewServiceId = await CompanyServices.updateServices(findCompanyResp);
            if (!updateNewServiceId) throw {
              message: "Error while updating service for this company."
            };
            res.send({
              message: `Service ${msg} for this company.`
            });
          }
        } else {
          const addCompanyServiceResp = await CompanyServices.addNew(servicesData);
          if (!addCompanyServiceResp) throw {
            message: "Error while adding company services."
          };
          res.send({
            message: `Service ${msg} for this company.`
          });
        }
      } catch (error) {
        res.status(400).json(error);
      }
    }
  );

  app.post("/api/company_services/get_service_pc", [jwt.verifyToken, jwt.verifyCompany], async (req, res) => {
    try {
      const reqData = req.body;
      if (!reqData.length) return res.status(400).json({
        message: "Services are not activated for Company"
      });
      const serviceFindRes = await ServicesSchema.findByIds(reqData);
      if (!serviceFindRes) return res.status(400).json({
        message: "Error while finding service ids"
      });
      if (!serviceFindRes.length || serviceFindRes.length == "0") return res.status(400).json({
        message: "No services found"
      });
      let i = 0;
      let temp = {
        info: {
          _postman_id: `BOOK-KING-${req.company.code}`,
          name: "3rd Party Services API Postman Collection",
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: [],
        protocolProfileBehavior: {},
      };
      serviceFindRes.forEach(async (service) => {
        const result = await s3helper.fetchJsonFromS3(
          service.file_s3_path.substring(service.file_s3_path.indexOf("services"))
        );
        if (!result) throw {
          message: "Error fetching json from s3"
        };
        var dataObj = {};
        result.forEach((element) => {
          dataObj[element.field] = element.validationmsg;
        });
        const item = {
          name: service.service_name,
          request: {
            method: service.type.toUpperCase(),
            header: [{
                key: "Content-Type",
                value: "application/json",
              },
              {
                key: "Authorization",
                value: "Bearer <>",
              },
              {
                key: "company_code",
                value: "",
              },
            ],
            body: {
              mode: "raw",
              raw: service.url === "api/get_va_num" || service.url === "api/emandate_debit" ? JSON.stringify([dataObj]) : JSON.stringify(dataObj),
            },
            url: {
              raw: process.env.POSTMAN_COLLECTION_RAW,
              host: process.env.POSTMAN_COLLECTION_HOST,
              path: [service.url],
            },
          },
          response: [],
        };
        temp.item.push(item);
        i++;
        if (i === serviceFindRes.length) {
          return res.status(200).json(temp);
        }
      });
    } catch (error) {
      res.status(400).json(error);
    }
  });
};