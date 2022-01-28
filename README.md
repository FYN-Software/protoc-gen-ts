# Protoc Plugin Typescript 

[![Release](https://github.com/FYN-Software/protoc-plugin-ts/actions/workflows/release.yml/badge.svg)](https://github.com/FYN-Software/protoc-plugin-ts/actions/workflows/release.yml)
![npm](https://img.shields.io/npm/v/@fyn-software/protoc-plugin-ts)
![npm](https://img.shields.io/npm/dm/@fyn-software/protoc-plugin-ts)

Aim of this protoc plugin is to make usage of protocol buffers easy in Javascript/Typescript by taking modern approaches.  This plugin generates plain **Typescript** files that can be used AMD, UMD, CommonJS module systems.


## Example

```proto
syntax = "proto3";

message Author {
    string name = 1;
    string role = 2;
}

message Change {
    Kind kind = 1;
    string patch = 2;
    repeated string tags = 3; 
    oneof name_or_id {
        string name = 4;
        string id = 5;
    }
    Author author = 6;
}

enum Kind {
    UPDATED = 0;
    DELETED = 1;
}
```


```typescript
// Constructed message
const change = new Change({
    kind: Kind.UPDATED,
    patch: "@@ -7,11 +7,15 @@",
    tags: ["no prefix", "as is"],
    name: "patch for typescript 4.5",
    author: new Author({
        name: "mary poppins",
        role: "maintainer"
    })
});

// Sent over the wire
const bytes: Uint8Array = change.serialize();

const receivedChange: Change = Change.deserialize(bytes);

console.log(receivedChange.kind == Kind.UPDATED) // true
console.log(receivedChange.patch) // "@@ -7,11 +7,15 @@"
console.log(receivedChange.tags) // ["no prefix", "as is"]
console.log(receivedChange.name) // "patch for typescript 4.5"
// see which one of the fields were filled
console.log(receivedChange.name_or_id) // "name"
console.log(receivedChange.author.name) // "mary poppins"
```


## Usage
```properties
npm install -g @fyn-software/protoc-plugin-ts

protoc -I=sourcedir --ts_out=dist myproto.proto
```

## Supported Options

| option                | type                     | default             | details                                                                                                                                                                                    |
|-----------------------|--------------------------|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ~~unary_rpc_promise~~ | `bool`                   | `false`             | This option is here for legacy reasons, see [thesayyn/protoc-gen-ts](https://github.com/thesayyn/protoc-gen-ts) for details                                                                |
| grpc_package          | `string`                 | `@fynsoftware/grpc` | you can specify which package to import                                                                                                                                                    |
| style                 | `'async'` or `'grpc-js'` | `'async'`           | you can determine the style of generated code<ul><li>`async` is meant to be compatible with `@fynsoftware/grpc`</li><li>`grpc-js` is meant to be compatible with `@grpc/grpc-js`</li></ul> |
| no_namespace          | `bool`                   | `true`              | you can enable/disable the generation of top-level namespace                                                                                                                               |

## Alternatives

This project is forked from [thesayyn/protoc-gen-ts](https://github.com/thesayyn/protoc-gen-ts).
If you prefer a larger community over the async interface generation simply use that over this.

## Development

Generates appropriate Protocol Buffer sources from Proto files directly through _TypeScript Compiler API_.

```sh
# when you make changes to the plugin, you will have to run the command below
npm run build
# then invoke the tests
npm test
```