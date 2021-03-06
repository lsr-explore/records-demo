/**
 * @file
 * @description Manage records: read from json and validate
 *
 * @copyright Laurie Reynolds 2016
 *
 */

var validate = require('validate.js')

import {Record} from '../../shared/model/record/record'
import {Fee} from '../../shared/model/record/fee'
import {Distribution} from '../../shared/model/record/distribution'
import {dataStoreManager} from '../../shared/model/dataStoreManager'
import {generateUUID} from '../utils/generateUUID'
import {properties} from '../utils/properties'

/**
 *
 * @type {{getInstance}}
 */
export var recordManager = (function () {
  'use strict'

  // Instance stores a reference to the Singleton
  var instance

  // Constraints TBD pending verification of requirements
  // ~ Need at least one fee
  // ~ Need at least one distribution
  // ~ Cannot have multiple flat fees
  // ~ Cannot have multiple per page fees
  //
  // Assumptions
  // ~ Distributions can occur in multiple records
  // ~ Amounts assigned to the same distribution across multiple records can be different
  // ~ Distribtions and fees must be >= $1 and <= $50
  //
  // TBD
  // ~ Record types must be unique - check existing records
  var recordConstraints = {
    'type': {
      presence: {
        message: '^is required'
      }
    }
  }

  var feesConstraints = {
    'name': {
      presence: {
        message: '^is required'
      }
    },
    'amount': {
      presence: {
        message: '^is required'
      },
      numericality: {
        greaterThanOrEqualTo: 1,
        lessThanOrEqualTo: 50,
        message: '^fee must be >= 1 and <= 50'
      }
    },
    'type': {
      presence: {
        message: '^is required'
      }
    }
  }

  var distributionConstraints = {
    'name': {
      presence: {
        message: '^is required'
      }
    },
    'amount': {
      presence: {
        message: '^is required'
      },
      numericality: {
        greaterThanOrEqualTo: 1,
        lessThanOrEqualTo: 50,
        message: '^distribution must be >= 1 and <= 50'
      }
    }
  }

  /**
   *
   * @param feesCollection
   * @param flatFee
   * @returns {*}
   */
  function validateFees (feesCollection) {
    var errorMessage = ''
    var flatFee = 0
    var feesNameMap = []

    // Loop through all the fees and validate each
    for (var key in feesCollection) {
      var recordFeesObj = feesCollection[key]
      // Validate the fee and break if there are errors
      errorMessage = validate(recordFeesObj, feesConstraints)
      if (typeof errorMessage !== 'undefined') {
        break
      }

      // Check if this fee already exists and break if it does
      if (feesNameMap[recordFeesObj.name]) {
        errorMessage = 'duplicate fee entries'
        break
      }

      // Save the fee name for duplicate checks
      feesNameMap[recordFeesObj.name] = 1

      // Save the flat fee to check against distributions for later
      if (recordFeesObj.type === properties.flat) {
        flatFee = recordFeesObj.amount
      }
    }
    return {
      'errorMessage': errorMessage,
      'flatFee': flatFee
    }
  }

  /**
   *
   * @param distributionsCollection
   * @param distributionTotals
   * @returns {*}
   */
  function validateDistributions (distributionsCollection) {
    var errorMessage = ''
    var distributionNameMap = []
    var distributionTotal = 0

    // Loop through all the distributions and validate each
    for (var key in distributionsCollection) {
      var recordDistributionsObj = distributionsCollection[key]
      errorMessage = validate(recordDistributionsObj, distributionConstraints)
      if (typeof errorMessage !== 'undefined') {
        break
      }

      // Check if this distribution already exists.  If not save it
      if (distributionNameMap[recordDistributionsObj.name]) {
        errorMessage = 'duplicate distribution entries'
        break
      }
      distributionNameMap[recordDistributionsObj.name] = 1

      distributionTotal += recordDistributionsObj.amount
    }
    return {
      'errorMessage': errorMessage,
      'distributionTotal': distributionTotal
    }
  }

  function validateRecord (recordCollection) {
    var errorMessage = ''

    var recordNamesMap = []
    var flatFee = 0
    var distributionTotal = 0

    for (var key in recordCollection) {
      var recordObj = recordCollection[key]
      // Validate the record and break if there is any error
      errorMessage = validate(recordObj, recordConstraints)
      if (typeof errorMessage !== 'undefined') {
        break
      }

      // Check if this record already exists and break if there is a duplicate
      if (recordNamesMap[recordObj.type]) {
        errorMessage = 'duplicate record entries'
        break
      }

      // Save the record name for duplicate check
      recordNamesMap[recordObj.type] = 1

      // Validate fees and break if there is an error
      var statusObj = validateFees(recordObj.fees)
      errorMessage = statusObj.errorMessage
      if (typeof errorMessage !== 'undefined') {
        break
      }
      flatFee = statusObj.flatFee

      // Validate distributions and break if there is an error
      statusObj = validateDistributions(recordObj.distributions)
      errorMessage = statusObj.errorMessage
      if (typeof errorMessage !== 'undefined') {
        break
      }

      distributionTotal = statusObj.distributionTotal

      // Check that the flatFee covers distributions
      if (distributionTotal > flatFee) {
        errorMessage = 'Distributions is greater than flat fee'
        break
      }
    }
    return errorMessage
  }

  function init () {
    return {
      /**
       *
       * @param recordCollection
       * @returns {boolean}
       */
      validateRecordCollection: function (recordCollection) {
        return validateRecord(recordCollection)
      },
      defineRecord: function (rawData) {
        var recordCollection = []

        var arrayLength = rawData.length
        for (var i = 0; i < arrayLength; i++) {
          var data = rawData[i]
          var _record = new Record()

          _record.type = data.order_item_type

          _record.fees = []
          var numItems = data.fees.length
          for (var j = 0; j < numItems; j++) {
            var feeItem = data.fees[j]
            var _fee = new Fee()

            if ('type' in feeItem) {
              _fee.type = feeItem.type
            } else {
              _fee.type = properties.flat
            }

            _fee.name = feeItem.name
            _fee.amount = parseInt(feeItem.amount)

            _record.fees[_fee.name] = _fee
          }

          _record.distributions = []
          numItems = data.distributions.length
          for (var jj = 0; jj < numItems; jj++) {
            var item = data.distributions[jj]
            var _distribution = new Distribution()

            if ('type' in item) {
              _distribution.type = item.type
            } else {
              _distribution.type = properties.flat
            }

            _distribution.name = item.name
            _distribution.amount = parseInt(item.amount)

            _record.distributions[_distribution.name] = _distribution
          }

          recordCollection[_record.type] = _record
        }

        var errorMessage = validateRecord(recordCollection)
        var collectionID = -1

        if (typeof errorMessage === 'undefined') {
          collectionID = generateUUID()
          dataStoreManager.getInstance().setData(collectionID, recordCollection)
        }
        return collectionID
      }
    }
  }

  return {
    // Get the Singleton instance if one exists
    // or create one if it doesn't
    getInstance: function () {
      if (!instance) {
        instance = init()
      }
      return instance
    }
  }
})()
