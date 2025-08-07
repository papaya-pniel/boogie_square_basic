export const createGrid = /* GraphQL */ `
  mutation CreateGrid(
    $input: CreateGridInput!
    $condition: ModelGridConditionInput
  ) {
    createGrid(input: $input, condition: $condition) {
      id
      name
      isActive
      status
      completedAt
      createdAt
      updatedAt
    }
  }
`;

export const updateGrid = /* GraphQL */ `
  mutation UpdateGrid(
    $input: UpdateGridInput!
    $condition: ModelGridConditionInput
  ) {
    updateGrid(input: $input, condition: $condition) {
      id
      name
      isActive
      status
      completedAt
      createdAt
      updatedAt
    }
  }
`;

export const createVideo = /* GraphQL */ `
  mutation CreateVideo(
    $input: CreateVideoInput!
    $condition: ModelVideoConditionInput
  ) {
    createVideo(input: $input, condition: $condition) {
      id
      s3Key
      gridId
      userId
      position
      createdAt
      updatedAt
    }
  }
`;

export const updateVideo = /* GraphQL */ `
  mutation UpdateVideo(
    $input: UpdateVideoInput!
    $condition: ModelVideoConditionInput
  ) {
    updateVideo(input: $input, condition: $condition) {
      id
      s3Key
      gridId
      userId
      position
      createdAt
      updatedAt
    }
  }
`;

export const createUser = /* GraphQL */ `
  mutation CreateUser(
    $input: CreateUserInput!
    $condition: ModelUserConditionInput
  ) {
    createUser(input: $input, condition: $condition) {
      id
      email
      name
      createdAt
      updatedAt
    }
  }
`;

export const updateUser = /* GraphQL */ `
  mutation UpdateUser(
    $input: UpdateUserInput!
    $condition: ModelUserConditionInput
  ) {
    updateUser(input: $input, condition: $condition) {
      id
      email
      name
      createdAt
      updatedAt
    }
  }
`;
