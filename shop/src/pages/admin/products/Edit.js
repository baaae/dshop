import React, { useState, useEffect } from 'react'
import { useRouteMatch, useHistory } from 'react-router'

import get from 'lodash/get'
import pickBy from 'lodash/pickBy'

import { useStateValue } from 'data/state'
import useProduct from 'utils/useProduct'
import useCollections from 'utils/useCollections'
import useBackendApi from 'utils/useBackendApi'
import useSetState from 'utils/useSetState'
import { formInput, formFeedback } from 'utils/formHelpers'
import { generateVariants } from 'utils/generateVariants'

import fetchProduct from 'data/fetchProduct'
import { Countries } from '@origin/utils/Countries'

import ImagePicker from 'components/ImagePicker'
import DeleteButton from './_Delete'
import EditOption from './_EditOption'
import EditVariants from './_EditVariants'

import LinkCollections from './_LinkCollections'

const predefinedProcessingTimes = [
  { value: '1 business day', label: '1 business day' },
  { value: '1-2 business days', label: '1-2 business days' },
  { value: '1-3 business days', label: '1-3 business days' },
  { value: '3-5 business days', label: '3-5 business days' },
  { value: '1-2 weeks', label: '1-2 weeks' },
  { value: '2-3 weeks', label: '2-3 weeks' },
  { value: '3-4 weeks', label: '3-4 weeks' },
  { value: '4-6 weeks', label: '4-6 weeks' },
  { value: '6-8 weeks', label: '6-8 weeks' },
  { value: 'custom', label: 'Custom' },
  { value: 'unknown', label: 'Unknown' }
]

const removeErrorKeys = (obj) => {
  return {
    ...pickBy(obj, (v, k) => !k.endsWith('Error'))
  }
}

function validate(state, { hasOptions }) {
  const newState = {}
  let validVariants = true
  let validCustomProcTime = true

  if (!state.title || !state.title.trim().length) {
    newState.titleError = 'Title is required'
  }

  if (!state.description || !state.description.trim().length) {
    newState.descriptionError = 'Description is required'
  }

  if (!state.price || state.price < 0) {
    newState.priceError = 'Price is required'
  } else if (!String(state.price).match(/^[0-9]+(\.[0-9]{1,2})?$/)) {
    newState.priceError = 'Invalid price'
  }

  if (hasOptions) {
    newState.variants = state.variants.map((variant) => {
      const out = removeErrorKeys(variant)
      if (!variant.title || !variant.title.trim().length) {
        out.titleError = 'Variant name is required'
      }

      if (!variant.options || !variant.options.length) {
        out.optionsError = 'At least one value is required'
      }

      return out
    })

    validVariants = newState.variants.every((v) =>
      Object.keys(v).every((f) => f.indexOf('Error') < 0)
    )
  }

  // if (!state.dispatchOrigin) {
  //   newState.dispatchOriginError = 'Select a dispatch origin'
  // }

  // if (!state.processingTime) {
  //   newState.processingTimeError = 'Select a processing time'
  // } else
  if (state.processingTime === 'custom') {
    newState.processingTimeOpts = {
      ...removeErrorKeys(state.processingTimeOpts)
    }

    if (!state.processingTimeOpts || !state.processingTimeOpts.fromVal) {
      newState.processingTimeOpts.fromValError = 'Select a value'
    }

    if (!state.processingTimeOpts || !state.processingTimeOpts.toVal) {
      newState.processingTimeOpts.toValError = 'Select a value'
    }

    validCustomProcTime = Object.keys(newState.processingTimeOpts).every(
      (f) => f.indexOf('Error') < 0
    )
  }

  const valid = Object.keys(newState).every((f) => f.indexOf('Error') < 0)
  return {
    valid: validVariants && validCustomProcTime && valid,
    newState: {
      ...removeErrorKeys(state),
      ...newState
    }
  }
}

const EditProduct = () => {
  const history = useHistory()
  const match = useRouteMatch('/admin/products/:productId')
  const [{ config }, dispatch] = useStateValue()
  const { productId } = match.params
  const { post } = useBackendApi({ authToken: true })

  const [submitting, setSubmitting] = useState(false)
  const [, setSubmitError] = useState(null)

  const [formState, setFormState] = useSetState({})
  const [selectedCollections, setSelectedCollections] = useState([])

  const [hasOptions, setHasOptions] = useState(false)

  const isNewProduct = productId === 'new'

  const input = formInput(formState, (newState) => setFormState(newState))
  const Feedback = formFeedback(formState)

  const procTimeState = get(formState, 'processingTimeOpts', {})

  const customProcTimeInput = formInput(procTimeState, (newState) => {
    setFormState({
      processingTimeOpts: {
        ...formState.processingTimeOpts,
        ...newState
      }
    })
  })
  const customProcTimeFeedback = formFeedback(procTimeState)

  const title = `${isNewProduct ? 'Add' : 'Edit'} product`

  const { product } = useProduct(productId)
  const { collections } = useCollections()
  const [media, setMedia] = useState([])

  useEffect(() => {
    if (product) {
      const newFormState = {
        ...product,
        price: (product.price / 100).toFixed(2),
        variants: (product.variants || []).map((variant) => ({
          ...variant,
          price: (variant.price / 100).toFixed(2)
        }))
      }

      let imageArray = product.images
      if (!imageArray && product.image) {
        imageArray = [product.image]
      } else if (!imageArray) {
        imageArray = []
      }

      const mappedImages = imageArray.map((image) => ({
        src: image.includes('/__tmp/')
          ? image
          : `/${localStorage.activeShop}/${product.id}/orig/${image}`,
        path: image
      }))

      const shouldBackfillOptions =
        newFormState.options &&
        (!newFormState.availableOptions ||
          newFormState.availableOptions.length !== product.options.length)

      if (shouldBackfillOptions) {
        // While editing existing products
        newFormState.availableOptions = newFormState.options.map(
          (option, index) => {
            // Parse possible values from generated variants
            return Array.from(
              new Set(
                (product.variants || [])
                  .map((v) => v.options[index])
                  .filter((o) => !!o)
              )
            )
          }
        )
      }

      // Regenerate variants
      newFormState.variants = generateVariants(newFormState)

      setMedia(mappedImages)
      setFormState(newFormState)
      setHasOptions(!!product.options && product.options.length > 0)
    }
  }, [product])

  useEffect(() => {
    if (collections && collections.length) {
      setSelectedCollections(
        collections
          .filter((c) => c.products.includes(productId))
          .map((c) => c.id)
      )
    }
  }, [collections, productId])

  useEffect(() => {
    if (hasOptions && (!formState.options || !formState.options.length)) {
      setFormState({
        // Enforce at least one option if checkbox is selected
        options: [''],
        availableOptions: [[]]
      })
    }
  }, [hasOptions, formState])

  const createProduct = async () => {
    if (submitting) return

    setSubmitError(null)

    const { valid, newState } = validate(formState, { hasOptions })
    setFormState(newState)

    if (!valid) {
      setSubmitError('Please fill in all required fields')
      return
    }

    setSubmitting(true)

    try {
      await post(`/products`, {
        method: 'POST',
        body: JSON.stringify({
          ...newState,
          price: newState.price * 100,
          images: media.map((file) => file.path),
          collections: selectedCollections,
          variants: (newState.variants || []).map((variant) => ({
            ...variant,
            price: variant.price * 100
          }))
        })
      })

      if (newState.id) {
        // Clear memoize cache for existing product
        fetchProduct.cache.delete(`${config.dataSrc}-${newState.id}`)
      }

      dispatch({ type: 'reload', target: ['products', 'collections'] })
      dispatch({ type: 'hasChanges' })
      return
    } catch (error) {
      console.error('Could not update the product', error)
      setSubmitError('Could not update the product')
    } finally {
      setSubmitting(false)
    }
  }

  const actions = (
    <div className="actions">
      {isNewProduct ? (
        <button
          className="btn btn-outline-primary"
          type="button"
          onClick={() => {
            history.push('/admin/products')
          }}
        >
          Discard
        </button>
      ) : (
        <DeleteButton type="button" product={product}>
          Delete
        </DeleteButton>
      )}
      <button
        className={`btn btn-${
          formState.hasChanges ? 'outline-' : ''
        }primary ml-2`}
        type="submit"
      >
        Save
      </button>
    </div>
  )

  return (
    <div className="admin-edit-product">
      <form
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault()
          createProduct()
        }}
      >
        <h3 className="admin-title with-border">
          {title}
          <div className="ml-auto">{actions}</div>
        </h3>

        <div className="row">
          <div className="col-md-9">
            <div className="form-section">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  {...input('title')}
                  autoFocus={isNewProduct}
                />
                {Feedback('title')}
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea {...input('description')} />
                {Feedback('description')}
              </div>

              <div className="media-uploader">
                <label>
                  Photos <span>(add as many as you like)</span>
                </label>
                <ImagePicker
                  images={media}
                  onChange={(media) => setMedia(media)}
                />
              </div>

              <div className="row">
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Price</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-text">$</span>
                      </div>
                      <input {...input('price')} />
                    </div>
                    {Feedback('price')}
                  </div>

                  <div className="form-group">
                    <label>
                      SKU <span>(Stock Keeping Unit)</span>
                    </label>
                    <input type="text" {...input('sku')} />
                    {Feedback('sku')}
                  </div>
                  {/* <div className="form-group">
                    <label>Quantity</label>
                    <input type="number" {...input('quantity')} />
                    {Feedback('quantity')}
                  </div> */}
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-12">
                <label>Variants</label>
                <div className="form-check">
                  <input
                    id="variantsCheckbox"
                    type="checkbox"
                    className="form-check-input"
                    checked={hasOptions}
                    onChange={(e) => setHasOptions(e.target.checked)}
                  />
                  <label
                    className="form-check-label"
                    htmlFor="variantsCheckbox"
                  >
                    This product has multiple options, like different sizes
                  </label>
                </div>
              </div>
            </div>

            {!hasOptions ? null : (
              <>
                {(formState.options || []).map((option, index) => {
                  return (
                    <EditOption
                      key={index}
                      label={`Option ${index + 1}`}
                      placeholder={
                        index === 0
                          ? 'eg Size'
                          : index === 1
                          ? 'eg Color'
                          : null
                      }
                      formState={{
                        title: option,
                        options: formState.availableOptions[index]
                      }}
                      setFormState={(newState) => {
                        const updatedState = {
                          options: [...formState.options],
                          availableOptions: [...formState.availableOptions]
                        }

                        const keysToUpdate = Object.keys(newState)

                        if (keysToUpdate.includes('title')) {
                          updatedState.options[index] = newState.title
                        }

                        if (keysToUpdate.includes('options')) {
                          updatedState.availableOptions[index] =
                            newState.options

                          updatedState.variants = generateVariants({
                            ...formState,
                            ...updatedState
                          })
                        }

                        setFormState(updatedState)
                      }}
                      onRemove={() => {
                        const options = [...formState.options]
                        const availableOptions = [...formState.availableOptions]
                        options.splice(index, 1)
                        availableOptions.splice(index, 1)
                        setFormState({ options, availableOptions })
                      }}
                    />
                  )
                })}
                <div className="mb-5">
                  {formState.options && formState.options.length >= 3 ? null : (
                    <button
                      className="btn btn-outline-primary"
                      type="button"
                      onClick={() =>
                        setFormState({
                          options: [...formState.options, ''],
                          availableOptions: [...formState.availableOptions, []]
                        })
                      }
                    >
                      Add option
                    </button>
                  )}
                </div>
                <EditVariants
                  options={formState.options}
                  variants={formState.variants}
                  media={media}
                  onChange={(updatedVariants) => {
                    setFormState({
                      variants: updatedVariants
                    })
                  }}
                />
              </>
            )}

            <div>
              <label>Shipping</label>
              <div className="form-check">
                <input
                  checked={formState.shipInternational ? true : false}
                  onChange={(e) =>
                    setFormState({ shipInternational: e.target.checked })
                  }
                  id="shippingCheckbox"
                  type="checkbox"
                  className="form-check-input"
                />
                <label className="form-check-label" htmlFor="shippingCheckbox">
                  Products ship internationally
                </label>
                {Feedback('shipping')}
              </div>
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label>Dispatch Origin</label>
                  <select {...input('dispatchOrigin')}>
                    <option>Please choose one...</option>
                    {Object.keys(Countries).map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                  {Feedback('dispatchOrigin')}
                </div>

                <div className="form-group">
                  <label>Processing Time</label>
                  <select {...input('processingTime')}>
                    <option>Please choose one...</option>
                    {predefinedProcessingTimes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {Feedback('processingTime')}
                </div>

                {formState.processingTime !== 'custom' ? null : (
                  <div className="row">
                    <div className="col-6">
                      <div className="form-group">
                        <select {...customProcTimeInput('fromVal')}>
                          <option>From...</option>
                          {new Array(10).fill(0).map((_, index) => (
                            <option key={index} value={index + 1}>
                              {index + 1}
                            </option>
                          ))}
                        </select>
                        {customProcTimeFeedback('fromVal')}
                      </div>
                    </div>

                    <div className="col-6">
                      <div className="form-group">
                        <select {...customProcTimeInput('toVal')}>
                          <option>To...</option>
                          {new Array(10).fill(0).map((_, index) => (
                            <option key={index} value={index + 1}>
                              {index + 1}
                            </option>
                          ))}
                        </select>
                        {customProcTimeFeedback('toVal')}
                      </div>
                    </div>

                    <div className="col-6">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          checked={
                            get(procTimeState, 'interval', 'days') === 'days'
                          }
                          onChange={(e) => {
                            setFormState({
                              processingTimeOpts: {
                                ...procTimeState,
                                interval: e.target.value
                              }
                            })
                          }}
                          value="days"
                          id="procTimeDays"
                        />
                        <label
                          htmlFor="procTimeDays"
                          className="form-check-label"
                        >
                          Business days
                        </label>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          checked={
                            get(procTimeState, 'interval', 'days') === 'weeks'
                          }
                          onChange={(e) => {
                            setFormState({
                              processingTimeOpts: {
                                ...procTimeState,
                                interval: e.target.value
                              }
                            })
                          }}
                          value="weeks"
                          id="procTimeWeeks"
                        />
                        <label
                          htmlFor="procTimeWeeks"
                          className="form-check-label"
                        >
                          Weeks
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <LinkCollections
              selectedValues={selectedCollections}
              onChange={setSelectedCollections}
            />
          </div>
        </div>
        <div className="footer-actions">{actions}</div>
      </form>
    </div>
  )
}

export default EditProduct

require('react-styl')(`
  .admin-edit-product
    display: block

    .footer-actions
      border-top: 1px solid #cdd7e0
      margin-top: 1rem
      padding-top: 2rem
      margin-bottom: 5rem
      display: flex
      justify-content: flex-end
    .actions .btn
      width: 120px

    .form-group, .form-check
      margin-bottom: 1rem

    textarea
      height: 150px

    label span
      color: #8293a4
      font-size: 0.875rem
      font-weight: normal
`)