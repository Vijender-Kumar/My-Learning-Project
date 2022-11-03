"use strict";
const Company = require("../models/company-schema");
const auth = require("../services/auth/auth");
const {
  check,
  validationResult
} = require("express-validator");

module.exports = (app) => {
  //Get all records
  app.get("/api/company", async (req, res) => {
    try {
      const companies = await Company.getAll();
      res.json(companies);
    } catch (error) {
      return res.status(400).send({
        error
      });
    }
  });

  //Search records by string
  app.get("/api/company/:id", async (req, res) => {
    try {
      var company = await Company.getById(req.params.id);
      res.json(company);
    } catch (error) {
      return res.status(400).send(error);
    }
  });

  //Add record
  app.post(
    "/api/company/",
    [
      check("name").notEmpty().withMessage("Partner name must be alphabet letters and is required"),
      check("cin")
      .notEmpty()
      .isAlphanumeric()
      .isLength({
        min: 21,
        max: 21
      })
      .withMessage("CIN should be alphanumeric with 21 character and is required"),
      check("billing_name").notEmpty().withMessage("Vendor billing name is required"),
      check("business_phone").notEmpty().withMessage("Business landline is required"),
      check("company_address").notEmpty().withMessage("Company address is required"),
      check("billing_address").notEmpty().withMessage("Billing address is required"),
      check("pin_code").notEmpty().isNumeric().isLength({
        min: 6,
        max: 6
      }).withMessage("Pincode should be numeric having length 6 and is required"),
      check("city").notEmpty().withMessage("Please enter city name"),
      check("state").notEmpty().withMessage("Please enter state"),
      check("service_delivery_state").notEmpty().withMessage("Service delivery state is required"),
      check("gstin")
      .optional({
        checkFalsy: true
      })
      .isAlphanumeric()
      .isLength({
        min: 15,
        max: 15
      })
      .withMessage("GSTIN should be alphanumeric having length 15"),
      check("directors").isArray().notEmpty().withMessage("Atleast one director is required"),
      check("website").notEmpty().withMessage("Please enter valid website url"),
      check("tin").notEmpty().withMessage("Please enter valid tin"),
    ],
    async (req, res, next) => {
      try {
        var companyData = req.body;
        companyData.directors = companyData.directors.split(",");
        //Search if record already exists
        var searchedCompany = await Company.search(companyData);
        if (searchedCompany)
          throw {
            message: "Company already exists with same data.",
            data: searchedCompany,
          };
        var company = await Company.addNew(companyData);
        res.json(company);
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  //Add bulk records
  app.post("/api/company/bulk", async (req, res, next) => {
    try {
      const companies = await Company.addBulk(req.body);
      res.json(companies);
    } catch (error) {
      return res.status(400).send({
        error
      });
    }
  });

  //Update existing records by id
  app.put("/api/company/:_id", async (req, res, next) => {
    try {
      const company = await Company.updateById(req.params._id, req.body, {});
      res.json(company);
    } catch (error) {
      return res.status(400).send({
        error
      });
    }
  });

  //Delete existing records
  app.delete("/api/company/:_id", async (req, res, next) => {
    try {
      var id = req.params._id;
      const company = await Company.deleteById({
        _id: id
      });
      res.json(company);
    } catch (error) {
      return res.status(400).send({
        error
      });
    }
  });
};