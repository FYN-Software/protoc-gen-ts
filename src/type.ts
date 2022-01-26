import { factory, Identifier, PropertyAccessExpression, TypeReferenceNode } from 'typescript';
import { DescriptorProto, FileDescriptorProto } from './compiler/descriptor.js';

const symbolMap: Map<string, string> = new Map();
const dependencyMap: Map<string, Identifier> = new Map();
const mapMap: Map<string, DescriptorProto> = new Map();

export function resetDependencyMap()
{
    dependencyMap.clear();
}

export function setIdentifierForDependency(dependency: string, identifier: Identifier): void
{
    dependencyMap.set(dependency, identifier);
}

function isMapEntry(descriptor: DescriptorProto): boolean
{
    return descriptor?.options?.map_entry ?? false;
}

export function getMapDescriptor(typeName: string): DescriptorProto|undefined
{
    return mapMap.get(typeName);
}

export function getTypeReferenceExpr(
    rootDescriptor: FileDescriptorProto,
    typeName: string,
): Identifier|PropertyAccessExpression
{
    const path = symbolMap.get(typeName);

    return !path || !dependencyMap.has(path)
        ? factory.createIdentifier(removeRootPackageName(typeName, rootDescriptor.package))
        : factory.createPropertyAccessExpression(dependencyMap.get(path)!, removeLeadingDot(typeName))
}

export function getTypeReference(
    rootDescriptor: FileDescriptorProto,
    typeName: string,
): TypeReferenceNode
{
    const path = symbolMap.get(typeName);

    if (!path || !dependencyMap.has(path))
    {
        return factory.createTypeReferenceNode(removeRootPackageName(typeName, rootDescriptor.package));
    }

    return factory.createTypeReferenceNode(
        factory.createQualifiedName(dependencyMap.get(path)!, removeLeadingDot(typeName))
    );
}

function removeLeadingDot(name: string): string {
    return name.replace(/^\./, '');
}

function replaceDoubleDots(name: string): string {
    return name.replace(/\.\./g, '.');
}

function removeRootPackageName(name: string, packageName: string): string
{
    return removeLeadingDot(packageName ? name.replace(`${packageName}.`, '') : name);
}

export function preprocess(
    target: FileDescriptorProto|DescriptorProto,
    path: string,
    prefix: string,
): void
{
    for (const enumDescriptor of target.enum_type) {
        symbolMap.set(replaceDoubleDots(`${prefix}.${enumDescriptor.name}`), path);
    }

    const messages: DescriptorProto[] =
        target instanceof FileDescriptorProto
            ? target.message_type
            : target.nested_type;

    for (let index = messages.length - 1; index >= 0; index--) {
        const messageDescriptor = messages[index];
        const name = replaceDoubleDots(`${prefix}.${messageDescriptor.name}`);

        if (isMapEntry(messageDescriptor)) {
            mapMap.set(name, messageDescriptor);
            messages.splice(index, 1);

            continue;
        }

        symbolMap.set(name, path);
        preprocess(messageDescriptor, path, name);
    }
}
