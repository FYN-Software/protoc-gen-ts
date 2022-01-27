import {
    Block,
    CallExpression, ClassDeclaration, ClassElement,
    ConstructorDeclaration,
    EnumDeclaration,
    Expression,
    factory, GetAccessorDeclaration, Identifier,
    MethodDeclaration, ModuleBlock,
    ModuleDeclaration,
    NodeFlags,
    Statement,
    SyntaxKind, TypeLiteralNode, TypeNode, TypeReferenceNode,
} from 'typescript';
import {
    DescriptorProto,
    EnumDescriptorProto, FieldDescriptorProto,
    FileDescriptorProto,
    OneofDescriptorProto,
} from './compiler/descriptor.js';
import { getMapDescriptor, getTypeReference, getTypeReferenceExpr } from './type.js';
import {
    getType,
    isBoolean,
    isEnum,
    isMap,
    isMessage,
    isNumber, isOneOf,
    isOptional, isPacked,
    isRepeated,
    isString, toBinaryMethodName,
    wrapRepeatedType,
} from './field.js';

/**
 * Returns a enum for the enum descriptor
 */
export function createEnum(enumDescriptor: EnumDescriptorProto): EnumDeclaration
{
    return factory.createEnumDeclaration(
        undefined,
        [ factory.createModifier(SyntaxKind.ExportKeyword) ],
        factory.createIdentifier(enumDescriptor.name),
        enumDescriptor.value.map(e => factory.createEnumMember(e.name, factory.createNumericLiteral(e.number))),
    );
}

function createFromObject(
    file: FileDescriptorProto,
    message: DescriptorProto,
): MethodDeclaration {
    const dataIdentifier = factory.createIdentifier('data');
    const messageIdentifier = factory.createIdentifier('message');

    const statements = [];
    const properties = [];

    for (const field of message.field) {
        let assignmentExpr: Expression =
            factory.createPropertyAccessExpression(
                dataIdentifier,
                field.name,
            );

        if (isMap(field)) {
            const [keyDescriptor, valueDescriptor] = getMapDescriptor(
                field.type_name,
            )!.field;

            assignmentExpr = factory.createCallExpression(
                factory.createPropertyAccessExpression(
                    factory.createIdentifier('Object'),
                    'entries',
                ),
                undefined,
                [assignmentExpr],
            );

            let coercer;

            if (isNumber(keyDescriptor)) {
                coercer = 'Number';
            } else if (isBoolean(keyDescriptor)) {
                coercer = 'Boolean';
            }

            if (isMessage(valueDescriptor) || !isString(keyDescriptor)) {
                let keyExpr: Expression = factory.createIdentifier('key');
                let valueExpr: Expression = factory.createIdentifier('value');

                if (coercer) {
                    keyExpr = factory.createCallExpression(
                        factory.createIdentifier(coercer),
                        undefined,
                        [keyExpr],
                    );
                }

                if (isMessage(valueDescriptor))
                {
                    valueExpr = factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            getTypeReferenceExpr(
                                file,
                                valueDescriptor.type_name,
                            ),
                            'fromObject',
                        ),
                        undefined,
                        [ factory.createIdentifier('value') ],
                    );
                }

                assignmentExpr = factory.createCallExpression(
                    factory.createPropertyAccessExpression(assignmentExpr, 'map'),
                    undefined,
                    [
                        factory.createArrowFunction(
                            undefined,
                            undefined,
                            [
                                factory.createParameterDeclaration(
                                    undefined,
                                    undefined,
                                    undefined,
                                    factory.createArrayBindingPattern([
                                        factory.createBindingElement(
                                            undefined,
                                            undefined,
                                            'key',
                                        ),
                                        factory.createBindingElement(
                                            undefined,
                                            undefined,
                                            'value',
                                        ),
                                    ]),
                                ),
                            ],
                            undefined,
                            factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                            factory.createArrayLiteralExpression([keyExpr, valueExpr]),
                        ),
                    ],
                );
            }
            assignmentExpr = factory.createNewExpression(
                factory.createIdentifier('Map'),
                undefined,
                [assignmentExpr],
            );
        } else if (isMessage(field)) {
            if (isRepeated(field)) {
                const arrowFunc = factory.createArrowFunction(
                    undefined,
                    undefined,
                    [
                        factory.createParameterDeclaration(
                            undefined,
                            undefined,
                            undefined,
                            "item",
                        ),
                    ],
                    undefined,
                    factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            getTypeReferenceExpr(
                                file,
                                field.type_name,
                            ),
                            'fromObject',
                        ),
                        undefined,
                        [factory.createIdentifier('item')],
                    ),
                );
                assignmentExpr = factory.createCallExpression(
                    factory.createPropertyAccessExpression(assignmentExpr, 'map'),
                    undefined,
                    [arrowFunc],
                );
            } else {
                assignmentExpr = factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                        getTypeReferenceExpr(
                            file,
                            field.type_name,
                        ),
                        "fromObject",
                    ),
                    undefined,
                    [
                        factory.createPropertyAccessExpression(
                            dataIdentifier,
                            field.name,
                        ),
                    ],
                );
            }
        }

        if (isOptional(file, field)) {
            const propertyAccessor = factory.createPropertyAccessExpression(
                dataIdentifier,
                field.name,
            );
            let condition = factory.createBinaryExpression(
                propertyAccessor,
                factory.createToken(SyntaxKind.ExclamationEqualsToken),
                factory.createNull(),
            );

            if (isMap(field)) {
                condition = factory.createBinaryExpression(
                    factory.createTypeOfExpression(propertyAccessor),
                    factory.createToken(SyntaxKind.EqualsEqualsToken),
                    factory.createStringLiteral("object"),
                );
            }

            statements.push(
                factory.createIfStatement(
                    condition,
                    factory.createBlock(
                        [
                            factory.createExpressionStatement(
                                factory.createBinaryExpression(
                                    factory.createPropertyAccessExpression(
                                        messageIdentifier,
                                        field.name,
                                    ),
                                    factory.createToken(SyntaxKind.EqualsToken),
                                    assignmentExpr,
                                ),
                            ),
                        ],
                        true,
                    ),
                ),
            );
        } else {
            properties.push(
                factory.createPropertyAssignment(
                    field.name,
                    assignmentExpr,
                ),
            );
        }
    }

    statements.unshift(
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [
                    factory.createVariableDeclaration(
                        "message",
                        undefined,
                        undefined,
                        factory.createNewExpression(
                            factory.createIdentifier(message.name),
                            undefined,
                            [factory.createObjectLiteralExpression(properties, true)],
                        ),
                    ),
                ],
                NodeFlags.Const,
            ),
        ),
    );

    statements.push(factory.createReturnStatement(messageIdentifier));

    return factory.createMethodDeclaration(
        undefined,
        [factory.createModifier(SyntaxKind.StaticKeyword)],
        undefined,
        factory.createIdentifier('fromObject'),
        undefined,
        undefined,
        [
            factory.createParameterDeclaration(
                undefined,
                undefined,
                undefined,
                dataIdentifier,
                undefined,
                createPrimitiveMessageSignature(file, message),
            ),
        ],
        undefined,
        factory.createBlock(statements, true),
    );
}

function createToObject(
    file: FileDescriptorProto,
    message: DescriptorProto,
): MethodDeclaration {
    const statements = [];
    const properties = [];
    const dataIdentifier = factory.createIdentifier('data');

    for (const field of message.field) {
        let valueExpr: Expression = factory.createPropertyAccessExpression(
            factory.createThis(),
            field.name,
        );

        if (isMap(field)) {
            const [, valueDescriptor] = getMapDescriptor(
                field.type_name,
            )!.field;

            if (isMessage(valueDescriptor)) {
                valueExpr = factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                        factory.createCallExpression(
                            factory.createPropertyAccessChain(
                                factory.createIdentifier("Array"),
                                undefined,
                                "from",
                            ),
                            undefined,
                            [valueExpr],
                        ),
                        "map",
                    ),
                    undefined,
                    [
                        factory.createArrowFunction(
                            undefined,
                            undefined,
                            [
                                factory.createParameterDeclaration(
                                    undefined,
                                    undefined,
                                    undefined,
                                    factory.createArrayBindingPattern([
                                        factory.createBindingElement(
                                            undefined,
                                            undefined,
                                            "key",
                                        ),
                                        factory.createBindingElement(
                                            undefined,
                                            undefined,
                                            "value",
                                        ),
                                    ]),
                                ),
                            ],
                            undefined,
                            factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                            factory.createArrayLiteralExpression([
                                factory.createIdentifier("key"),
                                factory.createCallExpression(
                                    factory.createPropertyAccessExpression(
                                        factory.createIdentifier("value"),
                                        "toObject",
                                    ),
                                    undefined,
                                    [],
                                ),
                            ]),
                        ),
                    ],
                );
            }

            valueExpr = factory.createCallExpression(
                factory.createPropertyAccessChain(
                    factory.createIdentifier("Object"),
                    undefined,
                    "fromEntries",
                ),
                undefined,
                [valueExpr],
            );
        } else if (isMessage(field)) {
            if (isRepeated(field)) {
                const arrowFunc = factory.createArrowFunction(
                    undefined,
                    undefined,
                    [
                        factory.createParameterDeclaration(
                            undefined,
                            undefined,
                            undefined,
                            "item",
                            undefined,

                            getTypeReference(file, field.type_name),
                        ),
                    ],
                    undefined,
                    factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createIdentifier("item"),
                            "toObject",
                        ),
                        undefined,
                        undefined,
                    ),
                );
                valueExpr = factory.createCallExpression(
                    factory.createPropertyAccessExpression(valueExpr, "map"),
                    undefined,
                    [arrowFunc],
                );
            } else {
                valueExpr = factory.createCallExpression(
                    factory.createPropertyAccessExpression(valueExpr, "toObject"),
                    undefined,
                    undefined,
                );
            }
        }

        if (isOptional(file, field)) {
            const propertyAccessor = factory.createPropertyAccessExpression(
                factory.createThis(),
                field.name,
            );
            let condition = factory.createBinaryExpression(
                propertyAccessor,
                factory.createToken(SyntaxKind.ExclamationEqualsToken),
                factory.createNull(),
            );

            if (isMap(field)) {
                condition = factory.createBinaryExpression(
                    factory.createPropertyAccessExpression(propertyAccessor, "size"),
                    factory.createToken(SyntaxKind.GreaterThanToken),
                    factory.createNumericLiteral(0),
                );
            }

            statements.push(
                factory.createIfStatement(
                    condition,
                    factory.createBlock(
                        [
                            factory.createExpressionStatement(
                                factory.createBinaryExpression(
                                    factory.createPropertyAccessExpression(
                                        dataIdentifier,
                                        field.name,
                                    ),
                                    factory.createToken(SyntaxKind.EqualsToken),
                                    valueExpr,
                                ),
                            ),
                        ],
                        true,
                    ),
                ),
            );
        } else {
            properties.push(
                factory.createPropertyAssignment(field.name, valueExpr),
            );
        }
    }

    statements.unshift(
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [
                    factory.createVariableDeclaration(
                        "data",
                        undefined,
                        createPrimitiveMessageSignature(file, message),
                        factory.createObjectLiteralExpression(properties, true),
                    ),
                ],
                NodeFlags.Const,
            ),
        ),
    );

    statements.push(factory.createReturnStatement(dataIdentifier));

    return factory.createMethodDeclaration(
        undefined,
        undefined,
        undefined,
        factory.createIdentifier("toObject"),
        undefined,
        undefined,
        [],
        undefined,
        factory.createBlock(statements, true),
    );
}

export function createNamespace(
    packageName: string,
    statements: Statement[],
): ModuleDeclaration {
    const identifiers = String(packageName).split(".");

    let declaration: ModuleDeclaration|ModuleBlock = factory.createModuleBlock(statements);

    for (let i = identifiers.length - 1; i >= 0; i--) {
        declaration = factory.createModuleDeclaration(
            undefined,
            [factory.createModifier(SyntaxKind.ExportKeyword)],
            factory.createIdentifier(identifiers[i]),
            declaration as ModuleBlock,
            NodeFlags.Namespace,
        );
    }

    return declaration as ModuleDeclaration;
}

function createMessageSignature(
    file: FileDescriptorProto,
    message: DescriptorProto,
): TypeNode {
    const oneOfSignatures = [];

    for (const [ index ] of message.oneof_decl.entries())
    {
        const childSignatures = [];

        for (const currentFieldDescriptor of message.field)
        {
            if (currentFieldDescriptor.oneof_index !== index)
            {
                continue;
            }

            const members = [];

            for (const field of message.field)
            {
                if (field.oneof_index != index)
                {
                    continue;
                }

                let fieldType: TypeNode =
                    factory.createTypeReferenceNode('never');

                if (field == currentFieldDescriptor) {
                    fieldType = wrapRepeatedType(
                        getType(file, field) as TypeNode,
                        field,
                    );
                }

                members.push(
                    factory.createPropertySignature(
                        undefined,
                        field.name,
                        factory.createToken(SyntaxKind.QuestionToken),
                        fieldType,
                    ),
                );
            }

            childSignatures.push(factory.createTypeLiteralNode(members));
        }

        oneOfSignatures.push(factory.createUnionTypeNode(childSignatures));
    }

    const fieldSignatures = message.field.map(f => factory.createPropertySignature(
        undefined,
        f.name,
        isOptional(file, f)
            ? factory.createToken(SyntaxKind.QuestionToken)
            : undefined,
        wrapRepeatedType(getType(file, f), f),
    ));

    if (oneOfSignatures.length)
    {
        return factory.createIntersectionTypeNode([
            factory.createTypeLiteralNode(fieldSignatures),
            factory.createUnionTypeNode(oneOfSignatures),
        ]);
    }

    return factory.createTypeLiteralNode(fieldSignatures);
}

function createPrimitiveMessageSignature(file: FileDescriptorProto, message: DescriptorProto): TypeLiteralNode
{
    const fieldSignatures = [];

    const wrapMessageType = (fieldType: TypeReferenceNode): TypeReferenceNode => factory.createTypeReferenceNode(
        'ReturnType',
        [
            factory.createTypeQueryNode(
                factory.createQualifiedName(
                    factory.createQualifiedName(fieldType.typeName, "prototype"),
                    "toObject",
                ),
            )
        ]
    );

    for (const field of message.field) {
        let fieldType: TypeNode = getType(file, field);

        if (isMap(field))
        {
            const [key, value] = getMapDescriptor(field.type_name)!.field;

            let valueType = getType(file, value);

            if (isMessage(value))
            {
                valueType = wrapMessageType(valueType);
            }

            fieldType = factory.createTypeLiteralNode([
                factory.createIndexSignature(
                    undefined,
                    undefined,
                    [
                        factory.createParameterDeclaration(
                            undefined,
                            undefined,
                            undefined,
                            'key',
                            undefined,
                            getType(file, key),
                        ),
                    ],
                    valueType as TypeNode,
                ),
            ]);
        }
        else if (isMessage(field))
        {
            fieldType = wrapMessageType(fieldType as TypeReferenceNode);
        }

        fieldSignatures.push(
            factory.createPropertySignature(
                undefined,
                field.name,
                isOptional(file, field)
                    ? factory.createToken(SyntaxKind.QuestionToken)
                    : undefined,
                wrapRepeatedType(fieldType as TypeNode, field),
            ),
        );
    }

    return factory.createTypeLiteralNode(fieldSignatures);
}

function createConstructor(
    file: FileDescriptorProto,
    message: DescriptorProto,
    pbIdentifier: Identifier,
): ConstructorDeclaration
{
    const dataIdentifier = factory.createIdentifier('data');
    const typeNode = factory.createUnionTypeNode([
        factory.createArrayTypeNode(factory.createTypeReferenceNode(factory.createIdentifier('any'), undefined)),
        createMessageSignature(file, message),
    ]);

    // Get oneOfFields
    const oneOfFields = message.oneof_decl.map(
        (_: OneofDescriptorProto, index: number) => factory.createArrayLiteralExpression(
            message.field
                .filter(fd => index === fd.oneof_index)
                .map(fd => factory.createNumericLiteral(fd.number)),
        ),
    );

    // Get repeated fields numbers
    const repeatedFields = message.field
        .filter(fd => isRepeated(fd) && !isMap(fd))
        .map(fd => factory.createNumericLiteral(fd.number));

    const statements: Statement[] = [
        // Create super(); statement
        factory.createExpressionStatement(
            factory.createCallExpression(
                factory.createSuper(),
                undefined,
                undefined,
            ),
        ),

        // Create initialize(); statement
        factory.createExpressionStatement(
            factory.createCallExpression(
                factory.createPropertyAccessExpression(
                    factory.createPropertyAccessExpression(pbIdentifier, 'Message'),
                    'initialize',
                ),
                undefined,
                [
                    factory.createThis(),
                    factory.createConditionalExpression(
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(
                                factory.createIdentifier('Array'),
                                'isArray',
                            ),
                            undefined,
                            [dataIdentifier],
                        ),
                        factory.createToken(SyntaxKind.QuestionToken),
                        dataIdentifier,
                        factory.createToken(SyntaxKind.ColonToken),
                        factory.createArrayLiteralExpression(),
                    ),
                    factory.createNumericLiteral('0'),
                    /* TODO: Handle extensions */
                    factory.createNumericLiteral('-1'),
                    factory.createArrayLiteralExpression(repeatedFields),
                    factory.createArrayLiteralExpression(oneOfFields),
                ],
            ),
        ),

        // Create data variable and if block
        factory.createIfStatement(
            factory.createBinaryExpression(
                factory.createLogicalNot(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createIdentifier('Array'),
                            'isArray',
                        ),
                        undefined,
                        [ dataIdentifier ],
                    ),
                ),
                SyntaxKind.AmpersandAmpersandToken,
                factory.createBinaryExpression(
                    factory.createTypeOfExpression(dataIdentifier),
                    SyntaxKind.EqualsEqualsToken,
                    factory.createStringLiteral('object'),
                ),
            ),
            factory.createBlock(
                message.field.map(field => {
                    const assigmentExpression = factory.createExpressionStatement(
                        factory.createBinaryExpression(
                            factory.createPropertyAccessExpression(
                                factory.createThis(),
                                field.name,
                            ),
                            SyntaxKind.EqualsToken,
                            factory.createPropertyAccessExpression(
                                dataIdentifier,
                                field.name,
                            ),
                        ),
                    );

                    if (!isOptional(file, field))
                    {
                        return assigmentExpression;
                    }

                    return factory.createIfStatement(
                        factory.createBinaryExpression(
                            factory.createBinaryExpression(
                                factory.createStringLiteral(field.name),
                                factory.createToken(SyntaxKind.InKeyword),
                                dataIdentifier,
                            ),

                            factory.createToken(SyntaxKind.AmpersandAmpersandToken),
                            factory.createBinaryExpression(
                                factory.createPropertyAccessExpression(dataIdentifier, field.name),
                                factory.createToken(SyntaxKind.ExclamationEqualsEqualsToken),
                                factory.createIdentifier('undefined'),
                            ),
                        ),
                        factory.createBlock([ assigmentExpression ], true),
                    );
                }),
            ),
        ),

        ...message.field
            .filter(field => isMap(field))
            .map(field => {
                const propertyAccessor = factory.createPropertyAccessExpression(factory.createThis(), field.name);

                return factory.createIfStatement(
                    factory.createPrefixUnaryExpression(SyntaxKind.ExclamationToken, propertyAccessor),
                    factory.createExpressionStatement(
                        factory.createBinaryExpression(
                            propertyAccessor,
                            factory.createToken(SyntaxKind.EqualsToken),
                            factory.createNewExpression(
                                factory.createIdentifier('Map'),
                                undefined,
                                [],
                            ),
                        ),
                    ),
                );
            }),
    ];

    return factory.createConstructorDeclaration(
        undefined,
        undefined,
        [
            factory.createParameterDeclaration(
                undefined,
                undefined,
                undefined,
                dataIdentifier,
                factory.createToken(SyntaxKind.QuestionToken),
                typeNode,
            ),
        ],
        factory.createBlock(statements, true),
    );
}

/**
 * Returns a get accessor for the field
 */
function createGetter(
    file: FileDescriptorProto,
    field: FieldDescriptorProto,
    pbIdentifier: Identifier,
): GetAccessorDeclaration {
    const getterType = wrapRepeatedType(getType(file, field) as TypeNode, field);
    let getterExpr: Expression = createGetterCall(file, field, pbIdentifier);

    if (isMap(field))
    {
        getterExpr = factory.createAsExpression(
            getterExpr,
            factory.createToken(SyntaxKind.AnyKeyword),
        );
    }

    return factory.createGetAccessorDeclaration(
        undefined,
        undefined,
        field.name,
        [],
        undefined,
        factory.createBlock(
            [
                factory.createReturnStatement(
                    factory.createAsExpression(getterExpr, getterType),
                ),
            ],
            true,
        ),
    );
}

function createGetterCall(
    file: FileDescriptorProto,
    field: FieldDescriptorProto,
    pbIdentifier: Identifier,
): CallExpression {
    let args: Expression[];
    let getterMethod = "getField";

    if (isMessage(field) && !isMap(field))
    {
        getterMethod = isRepeated(field)
            ? "getRepeatedWrapperField"
            : "getWrapperField";

        args = [
            factory.createThis(),
            getTypeReferenceExpr(file, field.type_name),
            factory.createNumericLiteral(field.number),
        ];
    }
    else
    {
        args = [
            factory.createThis(),
            factory.createNumericLiteral(field.number),
        ];

        if (field.default_value)
        {
            getterMethod = 'getFieldWithDefault';
            let _default: Expression;

            if (isEnum(field))
            {
                _default = factory.createPropertyAccessExpression(
                    getTypeReferenceExpr(file, field.type_name),
                    field.default_value,
                );
            }
            else if (isString(field))
            {
                _default = factory.createStringLiteral(
                    field.default_value,
                );
            }
            else if (isBoolean(field))
            {
                _default = factory.createIdentifier(field.default_value);
            }
            else
            {
                _default = factory.createIdentifier(field.default_value);
            }

            args.push(_default);
        }
    }

    return factory.createCallExpression(
        factory.createPropertyAccessExpression(
            factory.createPropertyAccessExpression(pbIdentifier, 'Message'),
            factory.createIdentifier(getterMethod),
        ),
        undefined,
        args,
    );
}

/**
 * Returns a class for the message descriptor
 */
function createOneOfGetter(
    index: number,
    oneOf: OneofDescriptorProto,
    message: DescriptorProto,
    pbIdentifier: Identifier,
): GetAccessorDeclaration {
    const numbers = [];
    const types: TypeNode[] = [
        factory.createLiteralTypeNode(factory.createStringLiteral('none')),
    ];
    const cases = [
        factory.createPropertyAssignment(factory.createNumericLiteral(0), factory.createStringLiteral('none')),
    ];

    for (const field of message.field.filter(f => f.oneof_index === index))
    {
        numbers.push(factory.createNumericLiteral(field.number));
        types.push(
            factory.createLiteralTypeNode(
                factory.createStringLiteral(field.name),
            ),
        );
        cases.push(
            factory.createPropertyAssignment(
                factory.createNumericLiteral(field.number),
                factory.createStringLiteral(field.name),
            ),
        );
    }

    const statements: Statement[] = [
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [
                    factory.createVariableDeclaration(
                        'cases',
                        undefined,
                        factory.createTypeLiteralNode([
                            factory.createIndexSignature(
                                undefined,
                                undefined,
                                [
                                    factory.createParameterDeclaration(
                                        undefined,
                                        undefined,
                                        undefined,
                                        'index',
                                        undefined,
                                        factory.createKeywordTypeNode(SyntaxKind.NumberKeyword),
                                    ),
                                ],
                                factory.createUnionTypeNode(types),
                            ),
                        ]),
                        factory.createObjectLiteralExpression(cases, true),
                    ),
                ],
                NodeFlags.Const,
            ),
        ),

        factory.createReturnStatement(
            factory.createElementAccessExpression(
                factory.createIdentifier('cases'),
                factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                        factory.createPropertyAccessExpression(pbIdentifier, 'Message'),
                        factory.createIdentifier('computeOneofCase'),
                    ),
                    undefined,
                    [
                        factory.createThis(),
                        factory.createArrayLiteralExpression(numbers),
                    ],
                ),
            ),
        ),
    ];

    return factory.createGetAccessorDeclaration(
        undefined,
        undefined,
        oneOf.name,
        [],
        undefined,
        factory.createBlock(statements, true),
    );
}

function createSetter(
    rootDescriptor: FileDescriptorProto,
    message: DescriptorProto,
    field: FieldDescriptorProto,
    pbIdentifier: Identifier,
)
{
    const type = wrapRepeatedType(
        getType(rootDescriptor, field),
        field,
    );
    const valueParameter = factory.createIdentifier("value");

    const block = isOneOf(field)
        ? createOneOfSetterBlock(
            message,
            field,
            valueParameter,
            pbIdentifier,
        )
        : createSetterBlock(field, valueParameter, pbIdentifier);

    return factory.createSetAccessorDeclaration(
        undefined,
        undefined,
        field.name,
        [
            factory.createParameterDeclaration(
                undefined,
                undefined,
                undefined,
                valueParameter,
                undefined,
                type,
            ),
        ],
        block,
    );
}

function createOneOfSetterBlock(
    message: DescriptorProto,
    field: FieldDescriptorProto,
    valueParameter: Identifier,
    pbIdentifier: Identifier,
): Block
{
    return factory.createBlock(
        [
            factory.createExpressionStatement(
                factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                        factory.createPropertyAccessExpression(pbIdentifier, 'Message'),
                        isMessage(field)
                            ? 'setOneofWrapperField'
                            : 'setOneofField',
                    ),
                    undefined,
                    [
                        factory.createThis(),
                        factory.createNumericLiteral(field.number),
                        factory.createArrayLiteralExpression(
                            message.field
                                .filter(field => field.oneof_index === field.oneof_index)
                                .map(field => factory.createNumericLiteral(field.number))
                        ),
                        valueParameter,
                    ],
                ),
            ),
        ],
        true,
    );
}

function createSetterBlock(
    field: FieldDescriptorProto,
    valueParameter: Identifier,
    pbIdentifier: Identifier,
): Block
{
    return factory.createBlock(
        [
            factory.createExpressionStatement(
                factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                        factory.createPropertyAccessExpression(pbIdentifier, 'Message'),
                        isMessage(field) && !isMap(field)
                            ? isRepeated(field)
                                ? 'setRepeatedWrapperField'
                                : 'setWrapperField'
                            : 'setField',
                    ),
                    undefined,
                    [
                        factory.createThis(),
                        factory.createNumericLiteral(field.number),
                        isMap(field)
                            ? factory.createAsExpression(valueParameter, factory.createToken(SyntaxKind.AnyKeyword))
                            : valueParameter,
                    ],
                ),
            ),
        ],
        true,
    );
}

/**
 * Returns the serialize method for the message class
 */
function createSerialize(
    file: FileDescriptorProto,
    message: DescriptorProto,
    pbIdentifier: Identifier,
): ClassElement[] {
    const identifiers = {
        writer: factory.createIdentifier('writer'),
        w: factory.createIdentifier('w'),
        value: factory.createIdentifier('value'),
        key: factory.createIdentifier('key'),
        undefined: factory.createIdentifier('undefined'),
        item: factory.createIdentifier('item'),
    };

    const statements: Statement[] = [
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [
                    factory.createVariableDeclaration(
                        'writer',
                        undefined,
                        undefined,
                        factory.createBinaryExpression(
                            identifiers.w,
                            SyntaxKind.BarBarToken,
                            factory.createNewExpression(
                                factory.createPropertyAccessExpression(
                                    pbIdentifier,
                                    'BinaryWriter',
                                ),
                                undefined,
                                [],
                            ),
                        ),
                    ),
                ],
                NodeFlags.Const,
            ),
        ),
    ];

    for (const field of message.field)
    {
        const propAccessor = factory.createPropertyAccessExpression(
            factory.createThis(),
            field.name,
        );

        if (isMap(field)) {
            const [keyDescriptor, valueDescriptor] = getMapDescriptor(
                field.type_name,
            )!.field;

            const valueExprArgs: Expression[] = [
                factory.createNumericLiteral(2),
                identifiers.value,
            ];

            if (isMessage(valueDescriptor))
            {
                valueExprArgs.push(
                    factory.createArrowFunction(
                        undefined,
                        undefined,
                        [],
                        undefined,
                        factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(
                                identifiers.value,
                                'serialize',
                            ),
                            undefined,
                            [ identifiers.writer ],
                        ),
                    ),
                );
            }

            const writeCall = factory.createExpressionStatement(
                factory.createCallExpression(
                    factory.createPropertyAccessExpression(identifiers.writer, 'writeMessage'),
                    undefined,
                    [
                        factory.createNumericLiteral(field.number),
                        propAccessor,
                        factory.createArrowFunction(
                            undefined,
                            undefined,
                            [],
                            undefined,
                            factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                            factory.createBlock(
                                [
                                    factory.createExpressionStatement(
                                        factory.createCallExpression(
                                            factory.createPropertyAccessExpression(
                                                identifiers.writer,
                                                factory.createIdentifier(
                                                    `write${toBinaryMethodName(
                                                        keyDescriptor,
                                                        file,
                                                    )}`,
                                                ),
                                            ),
                                            undefined,
                                            [
                                                factory.createNumericLiteral(1),
                                                identifiers.key,
                                            ],
                                        ),
                                    ),
                                    factory.createExpressionStatement(
                                        factory.createCallExpression(
                                            factory.createPropertyAccessExpression(
                                                identifiers.writer,
                                                factory.createIdentifier(
                                                    `write${toBinaryMethodName(
                                                        valueDescriptor,
                                                        file,
                                                    )}`,
                                                ),
                                            ),
                                            undefined,
                                            valueExprArgs,
                                        ),
                                    ),
                                ],
                                true,
                            ),
                        ),
                    ],
                ),
            );

            statements.push(
                factory.createForOfStatement(
                    undefined,
                    factory.createVariableDeclarationList(
                        [
                            factory.createVariableDeclaration(
                                factory.createArrayBindingPattern([
                                    factory.createBindingElement(undefined, undefined, 'key'),
                                    factory.createBindingElement(
                                        undefined,
                                        undefined,
                                        'value',
                                    ),
                                ]),
                            ),
                        ],
                        NodeFlags.Const,
                    ),
                    propAccessor,
                    factory.createBlock([writeCall]),
                ),
            );
        }
        else
        {
            const propParameters: Expression[] = [
                factory.createNumericLiteral(field.number),
                propAccessor,
            ];

            if (isMessage(field))
            {
                const { params, expression } = isRepeated(field)
                    ? {
                        params: [
                            factory.createParameterDeclaration(
                                undefined,
                                undefined,
                                undefined,
                                'item',
                                undefined,
                                getTypeReference(file, field.type_name),
                            ),
                        ],
                        expression: identifiers.item,
                    }
                    : {
                        params: [],
                        expression: factory.createPropertyAccessExpression(factory.createThis(), field.name),
                    };

                propParameters.push(
                    factory.createArrowFunction(
                        undefined,
                        undefined,
                        params,
                        undefined,
                        factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(expression, 'serialize'),
                            undefined,
                            [ identifiers.writer ],
                        ),
                    ),
                );
            }

            // this.prop !== undefined
            let condition = factory.createBinaryExpression(
                propAccessor,
                factory.createToken(SyntaxKind.ExclamationEqualsEqualsToken),
                identifiers.undefined,
            );

            const statement = factory.createExpressionStatement(
                factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                        identifiers.writer,
                        factory.createIdentifier(
                            `write${toBinaryMethodName(
                                field,
                                file,
                            )}`,
                        ),
                    ),
                    undefined,
                    propParameters,
                ),
            );

            if (isString(field) && !isRepeated(field))
            {
                condition = factory.createBinaryExpression(
                    factory.createBinaryExpression(
                        factory.createTypeOfExpression(propAccessor),
                        factory.createToken(SyntaxKind.EqualsEqualsEqualsToken),
                        factory.createStringLiteral('string'),
                    ),
                    factory.createToken(SyntaxKind.AmpersandAmpersandToken),
                    factory.createPropertyAccessExpression(propAccessor, 'length'),
                );
            }

            statements.push(factory.createIfStatement(condition, statement));
        }
    }

    statements.push(
        factory.createIfStatement(
            factory.createPrefixUnaryExpression(
                SyntaxKind.ExclamationToken,
                identifiers.w,
            ),
            factory.createReturnStatement(
                factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                        identifiers.writer,
                        'getResultBuffer',
                    ),
                    undefined,
                    [],
                ),
            ),
        ),
    );

    return [
        factory.createMethodDeclaration(
            undefined,
            undefined,
            undefined,
            "serialize",
            undefined,
            undefined,
            [],
            factory.createTypeReferenceNode("Uint8Array"),
            undefined,
        ),
        factory.createMethodDeclaration(
            undefined,
            undefined,
            undefined,
            "serialize",
            undefined,
            undefined,
            [
                factory.createParameterDeclaration(
                    undefined,
                    undefined,
                    undefined,
                    "w",
                    undefined,
                    factory.createTypeReferenceNode(
                        factory.createQualifiedName(pbIdentifier, 'BinaryWriter'),
                    ),
                    undefined,
                ),
            ],
            factory.createTypeReferenceNode('void'),
            undefined,
        ),
        factory.createMethodDeclaration(
            undefined,
            undefined,
            undefined,
            'serialize',
            undefined,
            undefined,
            [
                factory.createParameterDeclaration(
                    undefined,
                    undefined,
                    undefined,
                    'w',
                    factory.createToken(SyntaxKind.QuestionToken),
                    factory.createTypeReferenceNode(
                        factory.createQualifiedName(pbIdentifier, 'BinaryWriter'),
                    ),
                    undefined,
                ),
            ],
            factory.createUnionTypeNode([
                factory.createTypeReferenceNode('Uint8Array'),
                factory.createTypeReferenceNode('void'),
            ]),
            factory.createBlock(statements, true),
        ),
    ];
}

/**
 * Returns the deserialize method for the message class
 */
function createDeserialize(
    rootDescriptor: FileDescriptorProto,
    messageDescriptor: DescriptorProto,
    pbIdentifier: Identifier,
): ClassElement {
    const identifiers = {
        bytes: factory.createIdentifier('bytes'),
        Uint8Array: factory.createIdentifier('Uint8Array'),
        message: factory.createIdentifier('message'),
        reader: factory.createIdentifier('reader'),
        value: factory.createIdentifier('value'),
        deserialize: factory.createIdentifier('deserialize'),
    };

    const statements: Statement[] = [
        factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
                [
                    factory.createVariableDeclaration(
                        'reader',
                        undefined,
                        undefined,
                        factory.createConditionalExpression(
                            factory.createBinaryExpression(
                                identifiers.bytes,
                                SyntaxKind.InstanceOfKeyword,
                                factory.createPropertyAccessExpression(
                                    pbIdentifier,
                                    'BinaryReader',
                                ),
                            ),
                            factory.createToken(SyntaxKind.QuestionToken),

                            identifiers.bytes,
                            factory.createToken(SyntaxKind.ColonToken),
                            factory.createNewExpression(
                                factory.createPropertyAccessExpression(
                                    pbIdentifier,
                                    'BinaryReader',
                                ),
                                undefined,
                                [ identifiers.bytes ],
                            ),
                        ),
                    ),
                    factory.createVariableDeclaration(
                        'message',
                        undefined,
                        undefined,
                        factory.createNewExpression(
                            factory.createIdentifier(messageDescriptor.name),
                            undefined,
                            [],
                        ),
                    ),
                ],
                NodeFlags.Const,
            ),
        ),
    ];

    const cases = [];

    for (const field of messageDescriptor.field)
    {
        const statements = [];

        if (isRepeated(field) && !isMessage(field) && !isPacked(rootDescriptor, field))
        {
            statements.push(
                factory.createExpressionStatement(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createPropertyAccessExpression(
                                pbIdentifier,
                                'Message',
                            ),
                            'addToRepeatedField',
                        ),
                        undefined,
                        [
                            identifiers.message,
                            factory.createNumericLiteral(field.number),
                            factory.createCallExpression(
                                factory.createPropertyAccessExpression(
                                    identifiers.reader,
                                    `read${toBinaryMethodName(
                                        field,
                                        rootDescriptor,
                                        false,
                                    )}`,
                                ),
                                undefined,
                                [],
                            ),
                        ],
                    ),
                ),
            );
        }
        else if (isMap(field))
        {
            const [ key, value ] = getMapDescriptor(field.type_name)!.field;

            const keyCall = factory.createPropertyAccessExpression(
                identifiers.reader,
                factory.createIdentifier(`read${toBinaryMethodName(key, rootDescriptor)}`),
            );

            let valueCall;

            if (isMessage(value)) {
                valueCall = factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                    factory.createBlock(
                        [
                            factory.createVariableStatement(
                                undefined,
                                factory.createVariableDeclarationList(
                                    [ factory.createVariableDeclaration("value") ],
                                    NodeFlags.Let,
                                ),
                            ),
                            factory.createExpressionStatement(
                                factory.createCallExpression(
                                    factory.createPropertyAccessExpression(
                                        identifiers.reader,
                                        'readMessage',
                                    ),
                                    undefined,
                                    [
                                        identifiers.message,
                                        factory.createArrowFunction(
                                            undefined,
                                            undefined,
                                            [],
                                            undefined,
                                            factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                                            factory.createBinaryExpression(
                                                identifiers.value,
                                                SyntaxKind.EqualsToken,
                                                factory.createCallExpression(
                                                    factory.createPropertyAccessExpression(
                                                        getTypeReferenceExpr(
                                                            rootDescriptor,
                                                            value.type_name,
                                                        ),
                                                        'deserialize',
                                                    ),
                                                    undefined,
                                                    [ identifiers.reader ],
                                                ),
                                            ),
                                        ),
                                    ],
                                ),
                            ),
                            factory.createReturnStatement(identifiers.value),
                        ],
                        true,
                    ),
                );
            } else {
                valueCall = factory.createPropertyAccessExpression(
                    identifiers.reader,
                    factory.createIdentifier(`read${toBinaryMethodName(value, rootDescriptor)}`),
                );
            }

            statements.push(
                factory.createExpressionStatement(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(identifiers.reader, 'readMessage'),
                        undefined,
                        [
                            identifiers.message,
                            factory.createArrowFunction(
                                undefined,
                                undefined,
                                [],
                                undefined,
                                factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                                factory.createCallExpression(
                                    factory.createPropertyAccessExpression(
                                        factory.createPropertyAccessExpression(pbIdentifier, 'Map'),
                                        'deserializeBinary',
                                    ),

                                    undefined,
                                    [
                                        factory.createAsExpression(
                                            factory.createPropertyAccessExpression(
                                                identifiers.message,
                                                field.name),
                                            factory.createToken(SyntaxKind.AnyKeyword),
                                        ),
                                        identifiers.reader,
                                        keyCall,
                                        valueCall,
                                    ],
                                ),
                            ),
                        ],
                    ),
                ),
            );
        }
        else if (isMessage(field))
        {
            const readCall = factory.createCallExpression(
                factory.createPropertyAccessExpression(
                    getTypeReferenceExpr(rootDescriptor, field.type_name),
                    'deserialize',
                ),
                undefined,
                [ identifiers.reader ],
            );

            statements.push(
                factory.createExpressionStatement(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(identifiers.reader, 'readMessage'),
                        undefined,
                        [
                            factory.createPropertyAccessExpression(identifiers.message, field.name),
                            factory.createArrowFunction(
                                undefined,
                                undefined,
                                [],
                                undefined,
                                factory.createToken(SyntaxKind.EqualsGreaterThanToken),
                                isRepeated(field)
                                    ? factory.createCallExpression(
                                        factory.createPropertyAccessExpression(
                                            factory.createPropertyAccessExpression(
                                                pbIdentifier,
                                                "Message",
                                            ),
                                            'addToRepeatedWrapperField',
                                        ),
                                        undefined,
                                        [
                                            identifiers.message,
                                            factory.createNumericLiteral(field.number),
                                            readCall,
                                            getTypeReferenceExpr(rootDescriptor, field.type_name),
                                        ],
                                    )
                                    : factory.createBinaryExpression(
                                        factory.createPropertyAccessExpression(identifiers.message, field.name),
                                        SyntaxKind.EqualsToken,
                                        readCall,
                                    ),
                            ),
                        ],
                    ),
                ),
            );
        }
        else
        {
            statements.push(
                factory.createExpressionStatement(
                    factory.createBinaryExpression(
                        factory.createPropertyAccessExpression(identifiers.message, field.name),
                        SyntaxKind.EqualsToken,
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(
                                identifiers.reader,
                                `read${toBinaryMethodName(
                                    field,
                                    rootDescriptor,
                                    false,
                                )}`,
                            ),
                            undefined,
                            undefined,
                        ),
                    ),
                ),
            );
        }
        statements.push(factory.createBreakStatement());

        cases.push(
            factory.createCaseClause(
                factory.createNumericLiteral(field.number),
                statements,
            ),
        );
    }

    // Default clause
    cases.push(
        factory.createDefaultClause([
            factory.createExpressionStatement(
                factory.createCallExpression(
                    factory.createPropertyAccessExpression(identifiers.reader, 'skipField'),
                    undefined,
                    [],
                ),
            ),
        ]),
    );

    statements.push(
        factory.createWhileStatement(
            factory.createCallExpression(
                factory.createPropertyAccessExpression(
                    identifiers.reader,
                    'nextField',
                ),
                undefined,
                [],
            ),
            factory.createBlock(
                [
                    factory.createIfStatement(
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(
                                identifiers.reader,
                                'isEndGroup',
                            ),
                            undefined,
                            undefined,
                        ),
                        factory.createBreakStatement(),
                    ),
                    factory.createSwitchStatement(
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(
                                identifiers.reader,
                                'getFieldNumber',
                            ),
                            undefined,
                            [],
                        ),
                        factory.createCaseBlock(cases),
                    ),
                ],
                true,
            ),
        ),
    );

    statements.push(factory.createReturnStatement(identifiers.message));

    return factory.createMethodDeclaration(
        undefined,
        [factory.createModifier(SyntaxKind.StaticKeyword)],
        undefined,
        identifiers.deserialize,
        undefined,
        undefined,
        [
            factory.createParameterDeclaration(
                undefined,
                undefined,
                undefined,
                identifiers.bytes,
                undefined,
                factory.createUnionTypeNode([
                    factory.createTypeReferenceNode(
                        identifiers.Uint8Array,
                        undefined,
                    ),
                    factory.createTypeReferenceNode(
                        factory.createQualifiedName(pbIdentifier, 'BinaryReader'),
                        undefined,
                    ),
                ]),
            ),
        ],
        factory.createTypeReferenceNode(messageDescriptor.name, undefined),
        factory.createBlock(statements, true),
    );
}

/**
 * Returns the deserializeBinary method for the message class
 */
function createDeserializeBinary(message: DescriptorProto): ClassElement
{
    return factory.createMethodDeclaration(
        undefined,
        [ factory.createModifier(SyntaxKind.StaticKeyword) ],
        undefined,
        factory.createIdentifier('deserializeBinary'),
        undefined,
        undefined,
        [
            factory.createParameterDeclaration(
                undefined,
                undefined,
                undefined,
                factory.createIdentifier('bytes'),
                undefined,
                factory.createTypeReferenceNode(factory.createIdentifier('Uint8Array')),
            ),
        ],
        factory.createTypeReferenceNode(message.name),
        factory.createBlock(
            [
                factory.createReturnStatement(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createIdentifier(message.name),
                            'deserialize',
                        ),
                        undefined,
                        [ factory.createIdentifier('bytes') ],
                    ),
                ),
            ],
            true,
        ),
    );
}

/**
 * Returns the serializeBinary method for the Message class
 */
function createSerializeBinary(): ClassElement
{
    return factory.createMethodDeclaration(
        undefined,
        undefined,
        undefined,
        factory.createIdentifier('serializeBinary'),
        undefined,
        undefined,
        [],
        factory.createUnionTypeNode([
            factory.createTypeReferenceNode(
                factory.createIdentifier('Uint8Array'),
                [],
            ),
        ]),
        factory.createBlock(
            [
                factory.createReturnStatement(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createThis(),
                            'serialize',
                        ),
                        undefined,
                        undefined,
                    ),
                ),
            ],
            true,
        ),
    );
}

/**
 * Returns a class for the message descriptor
 */
function _createMessage(
    file: FileDescriptorProto,
    message: DescriptorProto,
    pbIdentifier: Identifier,
): ClassDeclaration
{


    // Create message class
    return factory.createClassDeclaration(
        undefined,
        [ factory.createModifier(SyntaxKind.ExportKeyword) ],
        message.name,
        undefined,
        [
            factory.createHeritageClause(SyntaxKind.ExtendsKeyword, [
                factory.createExpressionWithTypeArguments(
                    factory.createPropertyAccessExpression(
                        pbIdentifier,
                        factory.createIdentifier('Message'),
                    ),
                    [],
                ),
            ]),
        ],
        [
            // Create constructor
            createConstructor(file, message, pbIdentifier),

            // Create getter and setters
            ...message.field.flatMap(field => [
                createGetter(file, field, pbIdentifier),
                createSetter(file, message, field, pbIdentifier),
            ]),

            // Create one of getters
            ...Array.from(message.oneof_decl.entries()).map(
                ([index, oneofDescriptor]) =>
                    createOneOfGetter(
                        index,
                        oneofDescriptor,
                        message,
                        pbIdentifier,
                    ),
            ),

            // Create fromObject method
            createFromObject(file, message),

            // Create toObject method
            createToObject(file, message),

            // Create serialize  method
            ...createSerialize(file, message, pbIdentifier),

            // Create deserialize method
            createDeserialize(file, message, pbIdentifier),

            // Create serializeBinary method
            createSerializeBinary(),

            // Create deserializeBinary method
            createDeserializeBinary(message),
        ],
    );
}

export function createMessage(
    file: FileDescriptorProto,
    message: DescriptorProto,
    pbIdentifier: Identifier,
): Statement[]
{
    return [
        _createMessage(file, message, pbIdentifier),
        message.enum_type.length || message.nested_type.length
            ? createNamespace(message.name, [
                // Create enums
                ...message.enum_type.map(e => createEnum(e)),

                // Create messages
                ...message.nested_type.flatMap(m => createMessage(file, m, pbIdentifier)),
            ])
            : undefined,
    ].filter(s => s !== undefined) as Statement[];
}
