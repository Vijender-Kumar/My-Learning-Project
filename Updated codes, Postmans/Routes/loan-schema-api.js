"use strict";
const Company = require("../models/company-schema");
const helper = require("../util/helper.js");
const s3helper = require("../util/s3helper.js");
const verifySchema = require("../util/verifySchema.js");
const LoanDefaultTypes = require("../models/loan-default-types-schema");
const LoanCustomTemplates = require("../models/loan_custom_templates-schema");
const LoanTemplates = require("../models/loan-templates-schema");
const LoanSchemaModel = require("../models/loanschema-schema");
const ProductsSchema = require('../models/product-schema');

module.exports = (app) => {
  // get all records
  app.get("/api/loanschema", async (req, res) => {
    try {
      const loanSchemas = await LoanSchemaModel.findAll();
      res.json(loanSchemas);
    } catch (error) {
      return res.status(400).send(error);
    }
  });

  // get records by company_code
  app.get("/api/loanschema/:_company_id", async (req, res) => {
    try {
      const loanSchemasByCompanyId = await LoanSchemaModel.findAllByCompanyId(
        req.params._company_id
      );

      let loan_custom_templates_ids = [];
      let loanSchemaIds = [];

      await loanSchemasByCompanyId.map(({
        loan_custom_templates_id,
        _id
      }) => {
        loan_custom_templates_ids.push(String(loan_custom_templates_id))
        loanSchemaIds.push(_id);
      });

      const loanTemplates = await LoanTemplates.findByTemplateIds(loan_custom_templates_ids);
      const activeProducts = await ProductsSchema.findAllByLoanSchemaIds(loanSchemaIds);

      const data = await JSON.parse(JSON.stringify(loanSchemasByCompanyId))?.map((record) => {
        const templates = loanTemplates.filter((temp) => String(temp?.loan_custom_templates_id) === String(record?.loan_custom_templates_id));
        const products = activeProducts.filter((poro) => String(poro?.loan_schema_id) === String(record?._id));
        return {
          ...record,
          loanTemplates: templates,
          products: products,
        }
      });
      return res.json(data);
    } catch (error) {
      return res.status(400).send({
        error
      });
    }
  });

  //add record
  app.post("/api/loanschema", async (req, res, next) => {
    try {
      const loanReqData = req.body;
      // check for loan type is present in database
      var defaultLoanType = await LoanDefaultTypes.findByNameID(
        loanReqData.loan_type_name,
        loanReqData.loan_type_id
      );
      if (!defaultLoanType)
        throw {
          message: "Selected loan type not found in records.",
        };
      //validate template format
      const validateTemplate = await helper.validateTemplateFormat(
        loanReqData.templates
      );

      if (loanReqData.template_type === "custom") {
        var company = await Company.findById(loanReqData.company_id);
        if (!company)
          throw {
            message: "Selected company not found in records.",
          };
        loanReqData.company_code = company.code;
      }

      const schemaInCodeVerificationResult =
        verifySchema.verifySchemaWithTemplate(
          Object.keys(req.body.templates),
          loanReqData.templates
        );
      console.log(
        "schemaInCodeVerificationResult",
        schemaInCodeVerificationResult
      );
      if (schemaInCodeVerificationResult.error)
        throw {
          message: `Template file with fields you are trying to upload has issues. contact IT team.
          notExists - ${schemaInCodeVerificationResult.notExists.toString()} mismatchTemplates -
          ${schemaInCodeVerificationResult.mismatchTemplates.toString()}`,
        };

      //throw { message: "temp block please remove this line" };
      //upload all the templates to s3 and get pa
      const uploadTemplateToS3 = await s3helper.uploadTemplatesToS3Multi(
        loanReqData
      );
      if (!uploadTemplateToS3)
        throw {
          message: "Empty file, Error uploading templates to S3 "
        };

      const addLoanCustomTemplate = await LoanCustomTemplates.addNew({
        type: loanReqData.template_type,
        created_by: "",
      });

      const templatesInsert = await helper.createLoanTemplateRows(
        uploadTemplateToS3,
        addLoanCustomTemplate._id
      );
      //insert path in loan template table
      const addBulkLoanTemplate = await LoanTemplates.addBulk(templatesInsert);
      if (!addBulkLoanTemplate)
        throw {
          message: "Error while uploading loan template"
        };
      if (loanReqData.template_type === "default") {
        const loanTypeName = loanReqData.loan_type_name;
        const updateLoanDefaultType = await LoanDefaultTypes.findAndUpdate(
          loanReqData.loan_type_name,
          addLoanCustomTemplate._id
        );
        return res.json({
          message: "Default templates uploaded successfully"
        });
      } else {
        const loanSchemaCount = await LoanSchemaModel.getSchemaCount(
          loanReqData.loan_type_id,
          loanReqData.company_code
        );
        // create loanSchema name with company code, loan type name and the count of loan schema of same type
        const loanSchemaName = `${loanReqData.company_code}-${loanReqData.loan_type_name
          }-${loanSchemaCount + 1}`;
        //insert into loan-schema and loan-schema-template
        const loanSchemaObj = {
          loan_type_id: loanReqData.loan_type_id,
          amount: loanReqData.loan_schema_settings.amount,
          intrest_rate: loanReqData.loan_schema_settings.int_rt,
          int_rate_type: loanReqData.loan_schema_settings.int_rate_type,
          tenure_in_days: loanReqData.loan_schema_settings.tenure,
          writeoff_after_days: loanReqData.loan_schema_settings.writeof_in_days,
          status: 1,
          name: loanSchemaName,
          loan_custom_templates_id: addLoanCustomTemplate._id,
          int_rate: loanReqData.loan_schema_settings.int_rate,
          flexible_int_rate: loanReqData.loan_schema_settings.flexible_int_rate ?
            1 : 0,
          company_code: loanReqData.company_code,
          company_id: loanReqData.company_id,
          interest_on_usage: loanReqData.loan_schema_settings.interest_on_usage ?
            1 : 0,
          is_subvention_based_loans: loanReqData.loan_schema_settings
            .is_subvention_based_loans ?
            1 : 0,
          default_loan_status: loanReqData.loan_schema_settings.default_loan_status,
          cycle_days: loanReqData.loan_schema_settings.cycle_days ?
            loanReqData.loan_schema_settings.cycle_days : "",
        };
        const addNewLoanSchema = await LoanSchemaModel.addNew(loanSchemaObj);
        return res.json({
          message: "Loan schema added successfully"
        });
      }
    } catch (error) {
      return res.status(400).send(error);
    }
  });

  // change the loan status active or inactive
  app.put("/api/loan_schema", async (req, res) => {
    try {
      const data = req.body;
      const updateStatus = await LoanSchemaModel.updateStatus(
        data.id,
        data.status
      );
      res.json(updateStatus);
    } catch (error) {
      return res.status(400).send(error);
    }
  });

  // get productwise loan template
  app.post("/api/get_loan_template_product_wise", async (req, res) => {
    try {
      const loan_custom_templates_id = req.body.loan_custom_templates_id;
      const templatName = req.body.templatName;
      const loanTemplates = await LoanTemplates.findByNameTmplId(
        loan_custom_templates_id,
        templatName
      );
      if (!loanTemplates)
        throw {
          message: "No Template found for this product"
        };
      const fetchTemplateJson = await s3helper.fetchJsonFromS3(
        loanTemplates.path.substring(loanTemplates.path.indexOf("templates"))
      );
      res.json(fetchTemplateJson);
    } catch (error) {
      return res.status(400).send(error);
    }
  });

  // fetch loan template data by id
  app.post("/api/fetch_loan_template_data", async (req, res) => {
    try {
      const loanSchemaById = await LoanSchemaModel.findById(
        req.body.loan_schema_id
      );
      return res.send(loanSchemaById);
    } catch (error) {
      return res.status(400).send({
        error
      });
    }
  });
};