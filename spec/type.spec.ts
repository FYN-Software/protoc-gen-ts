import { DescriptorProto, FieldDescriptorProto, FileDescriptorProto } from '~/compiler/descriptor.js';
import { getTypeReference } from '~/type.js';
import { SyntaxKind, TypeReferenceNode } from 'typescript';

describe('Type', () => {
    const file = new FileDescriptorProto({
        dependency: [],
        public_dependency: [],
        weak_dependency: [],
        message_type: [
            new DescriptorProto({
                name: 'SomeMessage',
                enum_type: [],
                extension: [],
                extension_range: [],
                field: [
                    new FieldDescriptorProto({
                        name: 'SomeMessageField',
                        type_name: 'SomeMessage.SomeField',
                        type: FieldDescriptorProto.Type.TYPE_MESSAGE,
                        number: 1,
                    }),
                    new FieldDescriptorProto({
                        name: 'SomeScalarField',
                        type: FieldDescriptorProto.Type.TYPE_STRING,
                        number: 2,
                    }),
                ],
                nested_type: [],
                oneof_decl: [],
                reserved_name: [],
                reserved_range: [],
            }),
        ],
        enum_type: [],
        service: [],
        extension: [],
    });

    describe('When using the type utilities', () => {
        it('should be able to create a type reference for `SomeMessageField`', () => {
            const reference: TypeReferenceNode = getTypeReference(file, '.SomeMessage.SomeMessageField');

            expect(reference.kind).toEqual(SyntaxKind.TypeReference);
        });
    });
});