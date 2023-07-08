
var matchHtmlRegExp = /["'&<>]/;

/**
 * Escape special characters in the given string of html.
 *
 * @param  {string} string The string to escape for inserting into HTML
 * @return {string}
 * @public
 */

function escapeHTML(string) {
  var str = '' + string;
  var match = matchHtmlRegExp.exec(str);

  if (!match) {
    return str;
  }

  var escape;
  var html = '';
  var index = 0;
  var lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 60: // <
        escape = '&lt;';
        break;
      case 62: // >
        escape = '&gt;';
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index
    ? html + str.substring(lastIndex, index)
    : html;
}

let OP_ID = 1
const fs = require('fs')
const { paramCase } = require('change-case')
const TurndownService = require('turndown')
// const escapeHTML = require('escape-html')
const striptags = require('striptags').striptags
const recursiveReadDir = require('fs-readdir-recursive')
const mkdirp = require('mkdirp')
const YAML = require('yaml')
const turndownService = new TurndownService({
  bulletListMarker: '-'
})
turndownService.escape = (x) => x
turndownService.addRule('listItem', {
  filter: 'li',

  replacement: function (content, node, options) {
    content = content
      .replace(/^\n+/, '') // remove leading newlines
      .replace(/\n+$/, '\n') // replace trailing newlines with just a single one
      .replace(/\n/gm, '\n  '); // indent
    var prefix = options.bulletListMarker + ' ';
    var parent = node.parentNode;
    if (parent.nodeName === 'OL') {
      var start = parent.getAttribute('start');
      var index = Array.prototype.indexOf.call(parent.children, node);
      prefix = (start ? Number(start) + index : index + 1) + '. ';
    }
    return (
      prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
    );
  }
});

// const BASE_PATH = `okta`
// const BASE_PATH = `openapi-directory/APIs/googleapis.com`
const BASE_PATH = `openapi-directory/APIs/plaid.com`
const paths = //[`/s3/2006-03-01/openapi.yaml`]
  recursiveReadDir(BASE_PATH)
  //
    .filter(x => x.endsWith('openapi.yaml'))
    .map(x => `${BASE_PATH}/${x}`)
let OUTPUT_PATH

paths.forEach(path => {
  const yaml = YAML.parse(fs.readFileSync(path, 'utf-8'))
  OUTPUT_PATH = path.split('/')
  OUTPUT_PATH.pop()
  // OUTPUT_PATH.shift()
  // OUTPUT_PATH.shift()
  OUTPUT_PATH = OUTPUT_PATH.join('/')
  console.log(OUTPUT_PATH)
  writeSite(yaml)

  Object.keys(yaml.paths).forEach(path => {
    writePath(yaml, path, yaml.paths[path])
  })

  let schemas = yaml.components?.schemas ?? yaml.definitions

  if (schemas) {
    Object.keys(schemas).forEach(path => {
      writeSchema(yaml, path, schemas[path])
    })
  }
})

function writeSchema(yaml, name, schema, formalName) {
  const imports = {}
  const text = []
  text.push(``)
  formalName = formalName ?? paramCase(name)
  if (name) {
    text.push(`form ${formalName}, name <${name}>`)
  } else {
    text.push(`form ${formalName}`)
  }
  if (schema.description) {
    text.push(`  note <${cleanHTML(schema.description)}>`)
  }
  let addedXML = false
  switch (schema.type) {
    case 'object': {
      if (schema.properties) {
        handleProperties(yaml, imports, schema).forEach(line => {
          text.push(`  ${line}`)
        })
      }
      break
    }
    case 'string':
      text.push(`  like native-string`)
      imports['native-string'] = true
      if (schema.format) {
        text.push(`    bind lace, lace ${paramCase(schema.format)}`)
      }
      if (schema.enum) {
        schema.enum.forEach(val => {
          text.push(`    text <${val}>`)
        })
      }
      // https://swagger.io/docs/specification/data-models/oneof-anyof-allof-not/
      // not:
      break
    case 'integer':
      text.push(`  like native-integer`)
      imports['native-integer'] = true
      break
    case 'number':
      text.push(`  like native-number`)
      imports['native-number'] = true
      break
      // https://swagger.io/docs/specification/data-models/data-types/#numbers
      // minimum: 0
      // exclusiveMinimum: true
      // maximum: 50
    case 'boolean':
      text.push(`  like native-boolean`)
      imports['native-boolean'] = true
      break
    case 'array':
      text.push(`  like list`)
      imports['list'] = true
      const refs = []
      let wrapped
      if (schema.items.$ref) {
        handleRef(yaml, imports, schema.items, refs)
      } else if (schema.items.allOf) {
        schema.items.allOf.forEach(x => {
          if (x.$ref) {
            handleRef(yaml, imports, x, refs)
          } else {
            console.log(x, schema)
            // throw new Error('oops')
          }
          if (x.xml) {
            wrapped = x.xml?.wrapped
          }

        })
      } else if (schema.items.type) {
        handleParamSchema(yaml, imports, schema.items).forEach(line => {
          text.push(`    ${line}`)
        })
      } else if (!Object.keys(schema.items).length) {

      } else {
        console.log(schema.items)
        throw new Error('Oops')
      }
      if (refs.length > 1) {
        console.log(refs)
        throw new Error('refs length')
      }
      refs.forEach(line => {
        text.push(`    ${line}`)
      })
      if (wrapped === true) {
        addXML()
        text.push(`    host wrapped, term take`)
      } else if (wrapped) {
        addXML()
        text.push(`    host wrapped, text <${wrapped}>`)
      }
      break
    default:
      if (Object.keys(schema).length) {
        handleParamSchema(yaml, imports, schema).forEach(line => {
          text.push(`  ${line}`)
        })
        // console.log(schema)
        // throw new Error('schema type')
      }
  }

  if (schema.nullable) {
    text.push(`  void take`)
  }

  if (schema.xml) {
    if (schema.xml.namespace) {
      addXML()
      text.push(`    host namespace, text <${schema.xml.namespace}>`)
    }
    if (schema.xml.attribute) {
      addXML()
      text.push(`    host attribute, term take`)
    }
  }

  function addXML() {
    if (addedXML) {
      return
    }

    text.push(`  host xml`)

    addedXML = true
  }

  const finalImportText = getImportText(imports)

  text.unshift(...finalImportText)

  const p = `tmp/${OUTPUT_PATH}/base/${formalName}`
  try {
    mkdirp.sync(p)
    console.log(p)
    fs.writeFileSync(`${p}/base.link`, cleanText(text.join('\n')))
  } catch (e) {
    console.log(e)
  }
}

function handleProperties(yaml, imports, schema) {
  const text = []
  if (schema.properties) {
    Object.keys(schema.properties).forEach(propName => {
      const propData = schema.properties[propName]
      const isRequired = Boolean(schema.required && schema.required.find(x => x === propName))
      const refs = []
      let description
      let xml
      text.push(`take ${paramCase(propName)}, name <${propName}>`)

      if (propData.$ref) {
        handleRef(yaml, imports, propData, refs)
      } else if (propData.allOf) {
        propData.allOf.forEach(x => {
          if (x.$ref) {
            handleRef(yaml, imports, x, refs)
          } else if (x.description || x.xml) {
            description = x.description && cleanHTML(x.description)
            xml = x.xml?.name
          }
        })
      } else if (propData.properties) {
        text.push(`  like form`)
        handleProperties(yaml, imports, propData).forEach(line => {
          text.push(`    ${line}`)
        })
      }

      if (refs.length > 1) {
        throw new Error('Handle multi case')
      } else if (refs.length === 1) {
        text.push(`  ${refs[0]}`)
      }

      if (!isRequired) {
        text.push(`  void take`)
      }

      if (description) {
        text.push(`  note <${description}>`)
      }

      if (xml) {
        text.push(`  host xml`)
        text.push(`    host name, text <${xml}>`)
      }
    })
  } else {
    console.log(schema)
    throw new Error
  }
  return text
}

function handleRef(yaml, imports, x, refs) {
  const stems = x.$ref.substr(2).split('/')
  let node = yaml
  stems.forEach(stem => {
    node = node[stem]
  })
  if (!node) {
    throw new Error('Schema is elsewhere')
  }
  let schemaType = paramCase(stems.pop())
  switch (schemaType) {
    case 'string':
    case 'boolean':
    case 'integer':
      imports[schemaType] = true
      break
    default:
      imports[schemaType] = 2
      break
  }

  refs.push(`like ${schemaType}`)
}

function writePath(yaml, path, pathData) {
  // boot [request]
  //   head
  //   take
  //   rank [protocol]
  //   hint [header1]
  //   hint [header2]
  //   mate [user]
  //   code [password]
  //   host [domain]
  //   dock [port]
  //   line [path]
  //   find [search-param]
  //   deed [method]
  //   seed [body]
  //   loot [response]

  // loot [response]
  //   code 200
  //   hint
  //   seed
  //   free

  path = path.replace(/\{(\w+)\}/g, (_, $1) => {
    return `{${paramCase($1)}}`
  })

  Object.keys(pathData).forEach(method => {
    switch (method) {
      case 'get':
      case 'head':
      case 'post':
      case 'put':
      case 'delete':
      case 'connect':
      case 'options':
      case 'trace':
      case 'patch':
        break
      default:
        return
    }

    writeMethod(yaml, path, method, pathData)
  })
}

function denaturalize(x) {
  if (!x) return
  return paramCase(x.replace(/\s+[aoi]n?\s+/g, ' ').replace(/'/g, ''))
}

function writeMethod(yaml, path, method, pathData) {
  const imports = {}
  const defaultParameters = pathData.parameters
  const methodData = pathData[method]
  const operationId = methodData.operationId ?? denaturalize(methodData.summary) ?? `action-${OP_ID++}`
  const text = [``]
  if (methodData.operationId) {
    text.push(`boot ${paramCase(operationId)}, name <${operationId}>`)
  } else {
    text.push(`boot ${paramCase(operationId)}`)
  }
  text.push(`  deed ${paramCase(method)}`)
  if (methodData.description) {
    text.push(`  note <${cleanHTML(methodData.description)}>`)
  }
  const headers = []
  const queries = []
  const paths = []

  let requestBodyType
  if (methodData.requestBody) {
    // if (Object.keys(methodData.requestBody.content).length > 1) {
    //   console.log(methodData.requestBody.content)
    //   throw new Error('Only handled one so far')
    // }

    if (methodData.requestBody.content) {
      Object.keys(methodData.requestBody.content).forEach(type => {
        const contentSchema = methodData.requestBody.content[type].schema
        if (contentSchema.$ref) {
          requestBodyType = paramCase(contentSchema.$ref.substr(2).split('/').pop())
        } else {
          requestBodyType = paramCase(operationId) + '-body'
        }
      })
    }
  }

  // console.log(methodData)

  const body = []
  const files = []

  ;[...(defaultParameters ?? []), ...(methodData.parameters ?? [])].forEach(param => {
    switch (param.in) {
      case 'header':
        headers.push(param)
        break
      case 'query':
        queries.push(param)
        break
      case 'path':
        paths.push(param)
        break
      case 'body':
        body.push(param)
        break
      case 'formData':
        files.push(param)
        break
      default:
        if (param.$ref) {
          let node = yaml
          param.$ref.substr(2).split('/').forEach(stem => {
            node = node[stem]
          })
          param = node
        } else {
          console.log(param)
          throw new Error('param')
        }
    }
  })

  if (methodData.description) {
    text.push(``)
  }

  ;[...paths, ...headers, ...queries, ...body, ...files].forEach(param => {
    text.push(`  take ${paramCase(param.name)}`)

    handleParamSchema(yaml, imports, param.schema ?? param).forEach(line => {
      text.push(`    ${line}`)
    })

    if (param.description) {
      text.push(`    note <${cleanHTML(param.description)}>`)
    }
    if (!param.required) {
      text.push(`    void take`)
    }
  })

  if (methodData.requestBody) {
    text.push(`  take ${requestBodyType}, like ${requestBodyType}`)
    if (!methodData.requestBody.required) {
      text.push(`    void take`)
    }
  }

  text.push('')
  text.push(`  line <${path}>`)
  text.push('')

  headers.forEach(head => {
    text.push(`  hint <${head.name}>, loan ${paramCase(head.name)}`)
  })

  if (headers.length) {
    text.push('')
  }

  queries.forEach(param => {
    text.push(`  find <${param.name}>, loan ${paramCase(param.name)}`)
  })

  if (queries.length) {
    text.push('')
  }

  // console.log(methodData)

  if (methodData.requestBody && methodData.requestBody.content) {
    text.push('')
    Object.keys(methodData.requestBody.content).forEach(type => {
      const basicType = type.split('/').pop()
      const contentSchema = methodData.requestBody.content[type].schema
      if (contentSchema.$ref) {
        const schemaType = paramCase(contentSchema.$ref.substr(2).split('/').pop())
        text.push(`  seed ${basicType}, loan ${schemaType}`)
      } else {
        const name = paramCase(operationId) + '-body'
        imports[name] = 2
        writeSchema(yaml, null, contentSchema, name)
        text.push(`  seed ${basicType}, loan ${name}`)
      }
    })
    text.push('')
  } else if (body.length) {
    text.push(`  seed json, loan ${paramCase(body[0].name)}`)
    text.push('')
  }

  if (files.length) {
    files.forEach(file => {
      console.log(operationId)
      text.push(`  file ${paramCase(file.name)}`)
    })
    text.push('')
  }

  Object.keys(methodData.responses).forEach(statusCode => {
    const response = methodData.responses[statusCode]
    text.push(`  loot ${statusCode === 'default' ? 'fall' : statusCode}`)
    if (response.content) {
      Object.keys(response.content).forEach(type => {
        const basicType = type.split('/').pop()
        const schema = response.content[type].schema
        if (!schema || !Object.keys(schema).length) {
          text.push(`    seed ${basicType}`)
        } else if (schema.$ref) {
          const schemaType = paramCase(schema.$ref.substr(2).split(/schemas\//).pop())
          text.push(`    seed ${basicType}, like ${schemaType}`)
          imports[schemaType] = 2
        } else {
          text.push(`    seed ${basicType}`)
          if (schema.properties) {
            text.push(`      like form`)
            handleProperties(yaml, imports, schema).forEach(line => {
              text.push(`        ${line}`)
            })
          } else {
            handleParamSchema(yaml, imports, schema).forEach(line => {
              text.push(`      ${line}`)
            })
          }
        }
      })
    }

    if (response.description) {
      text.push(`    note <${cleanHTML(response.description)}>`)
    }
  })

  const finalImportText = getImportText(imports)

  text.unshift(...finalImportText)

  const p = `tmp/${OUTPUT_PATH}/boot/${paramCase(operationId)}`
  mkdirp.sync(p)
  console.log(p)
  fs.writeFileSync(`${p}/base.link`, cleanText(text.join('\n')))
}

function handleParamSchema(yaml, imports, schema) {
  const text = []

  switch (schema.type) {
    case 'string':
      imports['native-string'] = true
      text.push(`like native-string`)
      if (schema.default != null) {
        text.push(`    fall <${schema.default}>`)
      }
      break
    case 'file':
      imports['native-file'] = true
      text.push(`like native-file`)
      break
    case 'integer':
      imports['native-integer'] = true
      text.push(`like native-integer`)
      if (schema.format) {
        text.push(`  bind lace, lace ${paramCase(schema.format)}`)
      }
      if (schema.default != null) {
        text.push(`    fall <${schema.default}>`)
      }
      break
    case 'number':
      imports['native-number'] = true
      text.push(`like native-number`)
      if (schema.format) {
        text.push(`  bind lace, lace ${paramCase(schema.format)}`)
      }
      if (schema.default != null) {
        text.push(`    fall <${schema.default}>`)
      }
      break
    case 'boolean':
      imports['native-boolean'] = true
      text.push(`like native-boolean`)
      break
    case 'object':
      imports['form'] = true
      text.push(`like form`)
      if (schema.properties) {
        handleProperties(yaml, imports, schema).forEach(line => {
          text.push(`  ${line}`)
        })
      }
      break
    case 'array':
      text.push(`like list`)
      imports['list'] = true
      const refs = []
      let wrapped
      if (schema.items.$ref) {
        handleRef(yaml, imports, schema.items, refs)
      } else if (schema.items.allOf) {
        schema.items.allOf.forEach(x => {
          if (x.$ref) {
            handleRef(yaml, imports, x, refs)
          } else if (x.xml) {
            wrapped = x.xml?.wrapped
          }
        })
      } else if (schema.items.type) {
        handleParamSchema(yaml, imports, schema.items).forEach(line => {
          text.push(`  ${line}`)
        })
      } else {
        console.log(schema)
        throw new Error('list schema issue')
      }
      if (refs.length > 1) {
        console.log(refs)
        throw new Error('refs length')
      }
      refs.forEach(line => {
        text.push(`  ${line}`)
      })
      break
    default:
      if (schema.anyOf) {
        text.push(`like sink`)
        schema.anyOf.forEach(schema => {
          handleParamSchema(yaml, imports, schema).forEach(line => {
            text.push(`  ${line}`)
          })
        })
      } else if (schema.allOf) {
        text.push(`like link`)
        schema.allOf.forEach(schema => {
          handleParamSchema(yaml, imports, schema).forEach(line => {
            text.push(`  ${line}`)
          })
        })
      } else if (schema.$ref) {
        const refs = []
        handleRef(yaml, imports, schema, refs)
        text.push(...refs)
      } else if (schema.items) {
        text.push(`like list`)
        if (schema.items.anyOf) {
          text.push(`  like sink`)
          schema.items.anyOf.forEach(x => {
            if (x.$ref) {
              const refs = []
              handleRef(yaml, imports, x, refs)
              refs.forEach(line => {
                text.push(`    ${line}`)
              })
            } else if (x.properties) {
              text.push(`    like form`)
              handleProperties(yaml, imports, x).forEach(line => {
                text.push(`      ${line}`)
              })
            } else {
              console.log(schema)
              throw new Error('oops')
            }
            if (x.xml) {
              // wrapped = x.xml?.wrapped
            }
          })
        } else if (schema.items.allOf) {
          text.push(`  like link`)
          schema.items.allOf.forEach(x => {
            if (x.$ref) {
              const refs = []
              handleRef(yaml, imports, x, refs)
              refs.forEach(line => {
                text.push(`    ${line}`)
              })
            } else if (x.properties) {
              text.push(`    like form`)
              handleProperties(yaml, imports, x).forEach(line => {
                text.push(`      ${line}`)
              })
            } else {
              console.log(schema)
              throw new Error('oops')
            }
            if (x.xml) {
              // wrapped = x.xml?.wrapped
            }
          })
        }
      } else if (schema.nullable) {

      } else {
        console.log(schema)
        // throw new Error('param type')
      }
  }

  return text
}

function getImportText(imports) {
  const importText = []

  Object.keys(imports).forEach(key => {
    const val = imports[key]

    if (val === 2) {
      importText.push(`load @drumwork/snow/${OUTPUT_PATH}/base/${key}\n  take form ${key}`)
    } else {
      importText.push(`load @drumwork/snow/base/${key}\n  take form ${key}`)
    }
  })

  importText.sort()

  const finalImportText = [``]
  importText.forEach(lines => {
    finalImportText.push(lines)
    finalImportText.push('')
  })

  return finalImportText
}

function writeSite(yaml) {
  const text = [``]
  text.push(`tool ${paramCase(yaml.info.title)}`)
  text.push(`  mark <${yaml.info.version}>`)
  text.push(`  head <${yaml.info.title}>`)
  // text.push(`  flow <${yaml.info.description}>`)
  if (yaml.info['x-logo']) {
    text.push(`  view <${yaml.info['x-logo']['url']}>`)
    if (yaml.info['x-logo']['backgroundColor']) {
      text.push(`    tint ${yaml.info['x-logo']['backgroundColor'].replace('#', '#x').toLowerCase()}`)
    }
  }
  text.push(`  link term, text <${yaml.info.termsOfService}>`)
  if (yaml.info.contact) {
    text.push(`  mate <${yaml.info.contact.name}>`)
    text.push(`    cite <${yaml.info.contact.email}>`)
    if (yaml.info.contact.url) {
      text.push(`    face url, text <${yaml.info.contact.url}>`)
    }
  }
  if (yaml.info.contact?.['x-twitter']) {
    text.push(`    face twitter, text <${yaml.info.contact['x-twitter']}>`)
  }
  if (yaml.info.license) {
    text.push(`  term <${yaml.info.license.name}>`)
    text.push(`    link <${yaml.info.license.url}>`)
  }
  if (yaml.externalDocs) {
    text.push(`  read book, link <${yaml.externalDocs.url}>`)
    text.push(`    text <${yaml.externalDocs.description}>`)
  }

  text.push('')

  yaml.servers?.forEach((server, i) => {
    text.push(`site ${i + 1}`)
    const url = server.url.replace(/\{(\w+)\}/g, (_, $1) => {
      return `{${paramCase($1)}}`
    })
    if (server.variables) {
      Object.keys(server.variables).forEach(name => {
        const data = server.variables[name]
        text.push(`  take ${paramCase(name)}`)
        if (data.description) {
          text.push(`    note <${cleanHTML(data.description)}>`)
        }
        if (data.default) {
          text.push(`    fall <${data.default}>`)
        }
        if (data.enum) {
          text.push(`    like native-string-list`)
          data.enum.forEach(t => {
            text.push(`      text <${t}>`)
          })
        } else {
          console.log(server.variables)
          throw new Error('site data')
        }
      })
    }
    text.push(`  link <${url}>`)
    if (server.description) {
      text.push(`  note <${cleanHTML(server.description)}>`)
    }
    text.push('')
  })

  mkdirp.sync(`tmp/${OUTPUT_PATH}`)
  fs.writeFileSync(`tmp/${OUTPUT_PATH}/base.link`, text.join('\n'))
}

function cleanText(text) {
  let array = []
  let n = 0
  let isStart = true
  text.split('\n').forEach(line => {
    if (!line.trim()) {
      n++
      if (!isStart && n < 2) {
        array.push('')
      }
    } else {
      isStart = false
      array.push(line)
      n = 0
    }
  })
  if (array[array.length - 1] === '\n') array.pop()
  return '\n' + array.join('\n')
}

function cleanHTML(text) {
  return escapeHTML(turndownService.turndown(text).replace(/\*\s+/g, '* ')).replace(/–/g, '-')
  // return text.replace(/\*\s+/g, '* ').replace(/–/g, '-')
}

