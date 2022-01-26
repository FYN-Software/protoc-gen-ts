import { FieldDescriptorProto, FieldOptions, FileDescriptorProto } from './compiler/descriptor.js';
import { factory, TypeReferenceNode } from 'typescript';
import { getMapDescriptor, getTypeReference } from './type.js';

export function wrapRepeatedType(type: any, field: FieldDescriptorProto)
{
    if (isRepeated(field) && !isMap(field))
    {
        type = factory.createArrayTypeNode(type);
    }

    return type;
}

export function getMapType(file: FileDescriptorProto, field: FieldDescriptorProto): TypeReferenceNode
{
    const messageDescriptor = getMapDescriptor(field.type_name)!;
    const [ keyDescriptor, valueDescriptor ] = messageDescriptor.field;

    return factory.createTypeReferenceNode('Map', [
        getType(file, keyDescriptor),
        getType(file, valueDescriptor),
    ]);
}

export function getType(file: FileDescriptorProto, field: FieldDescriptorProto): TypeReferenceNode
{
    if (isMap(field))
    {
        return getMapType(file, field);
    }
    else if (hasJsTypeString(field))
    {
        return factory.createTypeReferenceNode('string');
    }

    switch (field.type)
    {
        case FieldDescriptorProto.Type.TYPE_DOUBLE:
        case FieldDescriptorProto.Type.TYPE_FLOAT:
        case FieldDescriptorProto.Type.TYPE_INT32:
        case FieldDescriptorProto.Type.TYPE_INT64:
        case FieldDescriptorProto.Type.TYPE_UINT32:
        case FieldDescriptorProto.Type.TYPE_UINT64:
        case FieldDescriptorProto.Type.TYPE_SINT32:
        case FieldDescriptorProto.Type.TYPE_SINT64:
        case FieldDescriptorProto.Type.TYPE_FIXED32:
        case FieldDescriptorProto.Type.TYPE_FIXED64:
        case FieldDescriptorProto.Type.TYPE_SFIXED32:
        case FieldDescriptorProto.Type.TYPE_SFIXED64:
        {
            return factory.createTypeReferenceNode('number');
        }

        case FieldDescriptorProto.Type.TYPE_STRING:
        {
            return factory.createTypeReferenceNode('string');
        }

        case FieldDescriptorProto.Type.TYPE_BOOL:
        {
            return factory.createTypeReferenceNode('boolean');
        }

        case FieldDescriptorProto.Type.TYPE_BYTES:
        {
            return factory.createTypeReferenceNode('Uint8Array');
        }

        case FieldDescriptorProto.Type.TYPE_MESSAGE:
        case FieldDescriptorProto.Type.TYPE_ENUM:
        {
            return getTypeReference(file, field.type_name)
        }

        default:
        {
            throw new Error(`Unhandled type ${field.type}`);
        }
    }
}

export function toBinaryMethodName(
    field: FieldDescriptorProto,
    file: FileDescriptorProto,
    isWriter: boolean = true,
): string
{
    let typeName = FieldDescriptorProto.Type[field.type - 1].toLowerCase();
    //lowercase first char
    typeName = typeName.charAt(0).toUpperCase() + typeName.slice(1);

    const prefix = isPacked(file, field)
        ? 'Packed'
        : isRepeated(field) && isWriter
            ? 'Repeated'
            : '';
    const suffix = hasJsTypeString(field)
        ? 'String'
        : '';

    return `${prefix}${typeName}${suffix}`;
}

export function hasJsTypeString(field: FieldDescriptorProto): boolean
{
    return field.options && field.options.jstype === FieldOptions.JSType.JS_STRING;
}

export function isMap(field: FieldDescriptorProto): boolean
{
    return getMapDescriptor(field.type_name) !== undefined;
}

export function isOneOf(field: FieldDescriptorProto): boolean
{
    return typeof field.oneof_index === 'number';
}

export function isRepeated(field: FieldDescriptorProto): boolean
{
    return field.label === FieldDescriptorProto.Label.LABEL_REPEATED;
}

export function isMessage(field: FieldDescriptorProto): boolean
{
    return field.type === FieldDescriptorProto.Type.TYPE_MESSAGE;
}

export function isNumber(field: FieldDescriptorProto): boolean
{
    switch (field.type)
    {
        case FieldDescriptorProto.Type.TYPE_DOUBLE:
        case FieldDescriptorProto.Type.TYPE_FLOAT:
        case FieldDescriptorProto.Type.TYPE_INT32:
        case FieldDescriptorProto.Type.TYPE_INT64:
        case FieldDescriptorProto.Type.TYPE_UINT32:
        case FieldDescriptorProto.Type.TYPE_UINT64:
        case FieldDescriptorProto.Type.TYPE_SINT32:
        case FieldDescriptorProto.Type.TYPE_SINT64:
        case FieldDescriptorProto.Type.TYPE_FIXED32:
        case FieldDescriptorProto.Type.TYPE_FIXED64:
        case FieldDescriptorProto.Type.TYPE_SFIXED32:
        case FieldDescriptorProto.Type.TYPE_SFIXED64:
        {
            return true;
        }

        default:
        {
            return false;
        }
    }
}

export function isEnum(field: FieldDescriptorProto): boolean
{
    return field.type === FieldDescriptorProto.Type.TYPE_ENUM;
}

export function isOptional(file: FileDescriptorProto, field: FieldDescriptorProto): boolean
{
    return file.syntax === 'proto3'
        ? field.label !== FieldDescriptorProto.Label.LABEL_REQUIRED || field.proto3_optional
        : field.label === FieldDescriptorProto.Label.LABEL_OPTIONAL;
}

export function isString(field: FieldDescriptorProto): boolean
{
    return field.type === FieldDescriptorProto.Type.TYPE_STRING;
}

export function isBoolean(field: FieldDescriptorProto): boolean
{
    return field.type === FieldDescriptorProto.Type.TYPE_BOOL;
}

export function isTypePackable(type: FieldDescriptorProto.Type): boolean
{
    return type !== FieldDescriptorProto.Type.TYPE_STRING
        && type !== FieldDescriptorProto.Type.TYPE_GROUP
        && type !== FieldDescriptorProto.Type.TYPE_MESSAGE
        && type !== FieldDescriptorProto.Type.TYPE_BYTES;
}

export function isPackable(field: FieldDescriptorProto): boolean
{
    return isRepeated(field) && isTypePackable(field.type);
}

export function isPacked(file: FileDescriptorProto, field: FieldDescriptorProto): boolean
{
    if (!isPackable(field))
    {
        return false;
    }

    return field.options?.packed ?? false;
}
