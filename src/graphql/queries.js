export const listGrids = /* GraphQL */ `
  query ListGrids(
    $filter: ModelGridFilterInput
    $limit: Int
    $nextToken: String
    $sort: ModelGridSortInput
  ) {
    listGrids(filter: $filter, limit: $limit, nextToken: $nextToken, sort: $sort) {
      items {
        id
        videos
        isActive
        status
        completedAt
        createdAt
        updatedAt
        users
      }
      nextToken
    }
  }
`;

export const getGrid = /* GraphQL */ `
  query GetGrid($id: ID!) {
    getGrid(id: $id) {
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
