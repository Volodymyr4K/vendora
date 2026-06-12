export type AttributeValueType = "STRING" | "NUMBER" | "BOOL" | "ENUM" | "DATE";

export type AttributeDefinition = {
    id: string;
    key: string;
    label: string;
    valueType: AttributeValueType;
    appliesToBaseTypes: string[];
    isFilterable: boolean;
    isSearchable: boolean;
};

export type AttributeDefinitionCreate = {
    key: string;
    label: string;
    valueType: AttributeValueType;
    appliesToBaseTypes?: string[];
    isFilterable?: boolean;
    isSearchable?: boolean;
};

export type AttributeDefinitionUpdate = {
    label?: string;
    appliesToBaseTypes?: string[];
    isFilterable?: boolean;
    isSearchable?: boolean;
};

export type AttributeValue = {
    id: string;
    itemId: string;
    definitionId: string;
    valueString?: string | null;
    valueNumber?: number | null;
    valueBool?: boolean | null;
    valueDate?: string | null;
    definition?: {
        id: string;
        key: string;
        label: string;
        valueType: AttributeValueType;
        isFilterable?: boolean;
    };
};

export type AttributeValueCreate = {
    itemId: string;
    definitionId: string;
    valueString?: string;
    valueNumber?: number;
    valueBool?: boolean;
    valueDate?: string;
};

export type AttributeValueUpdate = {
    valueString?: string | null;
    valueNumber?: number | null;
    valueBool?: boolean | null;
    valueDate?: string | null;
};
