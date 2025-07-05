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
    }
  }
`;
