const bodyParser = require("body-parser");
const Services = require("../models/services-schema.js");
const ServiceLog = require("../models/service-req-res-log-schema.js");
const s3helper = require("../util/s3helper.js");
const CompanySchema = require("../models/company-schema");
const {check, validationResult} = require("express-validator");

module.exports = (app, connection) => {
  app.use(bodyParser.json());

  app.get("/api/service", async (req, res) => {
    try {
      let data = await Services.listAll();
      if (!data.length)
        throw {
          message: "No records found"
        };
      res.send({
        data: data
      });
    } catch (error) {
      return res.status(400).json(error);
    }
  });

  app.get("/api/service/:id", async (req, res) => {
    try {
      // Check if service exists or not
      const service = await Services.findOneWithId(req.params.id);
      if (!service)
        throw {
          message: "Service not found"
        };
      const serviceDetails = JSON.parse(JSON.stringify(service));
      const resultJson = await s3helper.fetchJsonFromS3(
        service.file_s3_path.substring(service.file_s3_path.indexOf("services"))
      );
      if (!resultJson)
        throw {
          message: "Error fetching service json from s3"
        };
      serviceDetails.file = resultJson;
      delete serviceDetails.file_s3_path;
      res.send(serviceDetails);
    } catch (error) {
      return res.status(400).json(error);
    }
  });

  app.post("/api/service/by_section", async (req, res) => {
    try {
      const data = req.body;
      // list all services by given section.
      const serviceBySection = await Services.findBySection(data.section);
      if (!serviceBySection.length)
        throw {
          message: `No records found for service under ${data.section} section`
        };
      res.send(serviceBySection);
    } catch (error) {
      return res.status(400).json(error);
    }
  });

  app.post(
    "/api/service",
    [
      check("service_name")
        .notEmpty()
        .withMessage("Service name is required"),
      check("vendor_name")
        .notEmpty()
        .withMessage("Vendor name is required"),
      check("section")
        .notEmpty()
        .withMessage("Section is required"),
      check("url")
        .notEmpty()
        .withMessage("Service url is required"),
      check("type")
        .notEmpty()
        .withMessage("Service type is required"),
      check("file")
        .notEmpty()
        .withMessage("File is required")
    ],
    async (req, res) => {
      const serviceData = req.body;
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(422).json({
          message: errors.errors[0]["msg"]
        });
      try {
        const service = await Services.findOneWithName(
          serviceData.service_name
        );
        if (service)
          throw {
            message: "Service with same name already exists"
          };
        const key = `services/${serviceData.service_name}.txt`;
        //Upload json file as request body to s3
        const uploadedFile = await s3helper.uploadFileToS3(
          serviceData.file,
          key
        );
        if (!uploadedFile) {
          delete serviceData.file;
        }
        serviceData.file_s3_path = uploadedFile.Location;
        const serviceRecord = await Services.addNew(serviceData);
        if (!serviceRecord)
          throw {
            message: "Error while adding service record"
          };
        res.send({
          message: "Service added successfully.",
          serviceRecord
        });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  app.post(
    "/api/service_invoice",
    [
      check("company_id")
        .notEmpty()
        .withMessage("Company is required"),
      check("service_id")
        .notEmpty()
        .withMessage("Service is required"),
      check("from_date")
        .notEmpty()
        .withMessage("From date is required")
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage("Please enter valid from_date in YYYY-MM-DD format"),
      check("to_date")
        .notEmpty()
        .withMessage("To date is required")
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage("Please enter valid to_date in YYYY-MM-DD format")
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty())
          return res.status(422).json({
            success: false,
            message: errors.errors[0]["msg"]
          });
        const data = req.body;
        data.api_response_status = "SUCCESS";
        const serviceResp = await ServiceLog.getRecords(data);
        const company = await CompanySchema.findById(serviceResp[0].company_id);
        if (!company)
          throw {
            message: "Invalid company"
          };
        serviceResp.forEach(item => {
          item.company_name = company.name;
        });
        if (!serviceResp.length)
          throw {
            message: "No records found."
          };
        return res.status(200).send({
          data: serviceResp,
          count: serviceResp.length
        });
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.put("/api/service", async (req, res) => {
    try {
      //Check if service exists or not
      const service = await Services.findOneWithId(req.body.id);
      //Service not found cannot be updated
      if (!service)
        throw {
          message: "Service not found"
        };
      const updateStatus = await Services.updateStatus(
        req.body.id,
        req.body.status
      );
      if (!updateStatus)
        throw {
          message: "Error updating service status"
        };
      res.send({
        message: "Service status updated successfully."
      });
    } catch (error) {
      return res.status(400).json(error);
    }
  });

  app.put(
    "/api/service/:_id",
    [
      check("service_name")
        .notEmpty()
        .withMessage("Service name is required"),
      check("vendor_name")
        .notEmpty()
        .withMessage("Vendor name is required"),
      check("section")
        .notEmpty()
        .withMessage("Section is required"),
      check("url")
        .notEmpty()
        .withMessage("Service url is required"),
      check("type")
        .notEmpty()
        .withMessage("Service type is required"),
      check("file")
        .notEmpty()
        .withMessage("File is required")
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty())
          throw {
            message: errors.errors[0]["msg"]
          };
        let serviceData = req.body;
        const id = req.params._id;
        const findService = await Services.findOneWithId(id);
        if (!findService)
          throw {
            message: "Service does not exists"
          };

        if (serviceData.file) {
          const key = `services/${serviceData.service_name}.txt`;
          const uploadedFile = await s3helper.uploadFileToS3(
            serviceData.file,
            key
          );
          if (!uploadedFile)
            throw res.status(400).json({
              message: "Error while uploading file to s3."
            });
          serviceData.file_s3_path = uploadedFile.Location;
          delete serviceData.file;
        }

        const serviceUpdt = await Services.updateService(id, serviceData);
        if (!serviceUpdt)
          throw {
            message: "Error while updating service into database"
          };
        if (serviceUpdt) {
          return res.status(200).json({
            success: true,
            message: "Service updated successfully."
          });
        }
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );
};
