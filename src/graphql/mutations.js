export const createGrid = /* GraphQL */ `
  mutation CreateGrid(
    $input: CreateGridInput!
    $condition: ModelGridConditionInput
  ) {
    createGrid(input: $input, condition: $condition) {
      id
      videos
      isActive
      status
      completedAt
      createdAt
      updatedAt
      users
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
      videos
      isActive
      status
      completedAt
      createdAt
      updatedAt
      users
    }
  }
`;

export const createUserGrid = /* GraphQL */ `
  mutation CreateUserGrid(
    $input: CreateUserGridInput!
    $condition: ModelUserGridConditionInput
  ) {
    createUserGrid(input: $input, condition: $condition) {
      id
      userId
      gridId
      completedAt
      createdAt
      updatedAt
    }
  }
`;
